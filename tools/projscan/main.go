// projscan — deterministic parity scanner.
//
// Walks one or more "source" repos plus our own ("self"), builds an exhaustive
// inventory (files/LOC by ext and top-level dir), an exported-symbol index
// (Rust/TS/Py), and a capability matrix (curated keyword buckets → hits per
// repo). Emits a markdown report + JSON. Pure stdlib, no external deps.
//
// Usage:
//
//	go run ./tools/projscan --repos /path/opencode,/path/codex \
//	   --self . --out parity-report.md --json parity-report.json
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// capabilities is the curated list scanned across every repo (incl. self).
var capabilities = []Cap{
	{"sandbox", []string{"sandbox", "seatbelt", "landlock", "seccomp", "bwrap", "bubblewrap"}},
	{"approval", []string{"approval", "approve", "ask_for_approval", "askforapproval"}},
	{"exec_policy", []string{"execpolicy", "exec policy", "exec_policy", "command policy", "allowlist", "denylist", "deny list", "allow list"}},
	{"compaction", []string{"compact", "compaction", "summariz"}},
	{"prompt_cache", []string{"cache_control", "ephemeral", "prompt cache", "prefix cache", "cache breakpoint"}},
	{"retry", []string{"retry", "rate limit", "rate_limit", "retry-after", "retry_after", "backoff"}},
	{"diff", []string{"diff", "unified diff", "render_diff", "diff_render"}},
	{"apply_patch", []string{"apply_patch", "apply-patch", "applypatch", "hunk", "begin patch"}},
	{"hooks", []string{"pretooluse", "posttooluse", "lifecycle hook", "hook handler", "managed_hooks", "hooks"}},
	{"profile", []string{"profile", "config profile", "named profile"}},
	{"reasoning_effort", []string{"reasoning_effort", "reasoning effort", "service_tier", "verbosity"}},
	{"provider", []string{"provider", "model_provider", "modelprovider", "bedrock", "ollama"}},
	{"mcp", []string{"mcp", "model context protocol", "elicitation", "rmcp"}},
	{"fuzzy", []string{"fuzzy", "fuzzysort", "fuse.js", "subsequence"}},
	{"history", []string{"history", "scrollback", "reverse search", "navigatehistory"}},
	{"streaming", []string{"streaming", "stream delta", "markdown_stream", "token delta"}},
	{"token_cost", []string{"token ledger", "tokenledger", "cost tracker", "costusd", "usage", "input_tokens", "output_tokens"}},
	{"permission", []string{"permission", "trust", "trusted", "readonly", "read-only"}},
	{"skill", []string{"skill", "skill.md", "skills"}},
	{"interrupt", []string{"interrupt", "cancel", "abort", "resume", "ctrl+c"}},
	{"subagent", []string{"subagent", "sub-agent", "delegate", "fork thread", "thread fork"}},
	{"parallel_tools", []string{"parallel tool", "tool runtime", "fiberset", "parallel_execution"}},
	{"flow_lambda", []string{"lambda_flow", "lambdaflow", "hypofront", "flow_index", "flowindex", "transient hypofrontality", "computeflowindex"}},
}

type fileStat struct {
	Lang string `json:"lang"`
	LOC  int    `json:"loc"`
}

type repoReport struct {
	Name        string            `json:"name"`
	Root        string            `json:"root"`
	Files       int               `json:"files"`
	LOC         int               `json:"loc"`
	ByExt       map[string]int    `json:"byExt"`
	LOCByExt    map[string]int    `json:"locByExt"`
	SymbolsByDir map[string]int   `json:"symbolsByDir"`
	SymbolCount int               `json:"symbolCount"`
	CapHits     map[string]int    `json:"capHits"`
	// CapFiles: capability ID -> up to N example "dir/file" paths.
	CapFiles map[string][]string `json:"capFiles"`
}

func newRepoReport(name, root string) *repoReport {
	return &repoReport{
		Name: name, Root: root,
		ByExt: map[string]int{}, LOCByExt: map[string]int{},
		SymbolsByDir: map[string]int{}, CapHits: map[string]int{},
		CapFiles: map[string][]string{},
	}
}

const maxCapFiles = 8

func topDir(rel string) string {
	parts := strings.SplitN(filepath.ToSlash(rel), "/", 2)
	return parts[0]
}

func scanRepo(name, root string) (*repoReport, error) {
	rep := newRepoReport(name, root)
	capFileSeen := map[string]map[string]bool{}
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // tolerate unreadable entries
		}
		if d.IsDir() {
			if path != root && shouldSkip(d.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		ext := filepath.Ext(d.Name())
		lang := langForExt(ext)
		rep.ByExt[ext]++
		rep.Files++
		data, rerr := os.ReadFile(path)
		if rerr != nil {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		dir := topDir(rel)
		lines := strings.Split(string(data), "\n")
		rep.LOC += len(lines)
		rep.LOCByExt[ext] += len(lines)
		for _, line := range lines {
			if lang != "" && lang != "md" {
				if _, ok := exportedSymbol(lang, line); ok {
					rep.SymbolsByDir[dir]++
					rep.SymbolCount++
				}
			}
			for _, cap := range capHits(line, capabilities) {
				rep.CapHits[cap]++
				if capFileSeen[cap] == nil {
					capFileSeen[cap] = map[string]bool{}
				}
				if len(rep.CapFiles[cap]) < maxCapFiles && !capFileSeen[cap][rel] {
					capFileSeen[cap][rel] = true
					rep.CapFiles[cap] = append(rep.CapFiles[cap], rel)
				}
			}
		}
		return nil
	})
	return rep, err
}

func sortedKeys[V any](m map[string]V) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return ks
}

func writeReport(reports []*repoReport, selfName string, mdPath, jsonPath string) error {
	// Capability matrix: cap -> repo -> hits
	matrix := map[string]map[string]int{}
	for _, c := range capabilities {
		matrix[c.ID] = map[string]int{}
		for _, r := range reports {
			matrix[c.ID][r.Name] = r.CapHits[c.ID]
		}
	}
	others := []string{}
	for _, r := range reports {
		if r.Name != selfName {
			others = append(others, r.Name)
		}
	}
	gapList := gaps(matrix, selfName, others)

	var b strings.Builder
	b.WriteString("# Parity Report — projscan\n\n")
	b.WriteString("Deterministic scan (Go, stdlib). Compares source repos against `self` to surface capability gaps.\n\n")

	// Inventory
	b.WriteString("## Inventory\n\n| Repo | Files | LOC | Exported symbols |\n|---|--:|--:|--:|\n")
	for _, r := range reports {
		b.WriteString(fmt.Sprintf("| %s | %d | %d | %d |\n", r.Name, r.Files, r.LOC, r.SymbolCount))
	}
	b.WriteString("\n")

	// Top dirs by symbol count per repo
	b.WriteString("## Top modules by exported-symbol count\n\n")
	for _, r := range reports {
		b.WriteString(fmt.Sprintf("**%s**: ", r.Name))
		type ds struct {
			dir string
			n   int
		}
		var arr []ds
		for d, n := range r.SymbolsByDir {
			arr = append(arr, ds{d, n})
		}
		sort.Slice(arr, func(i, j int) bool {
			if arr[i].n != arr[j].n {
				return arr[i].n > arr[j].n
			}
			return arr[i].dir < arr[j].dir
		})
		parts := []string{}
		for i, x := range arr {
			if i >= 10 {
				break
			}
			parts = append(parts, fmt.Sprintf("%s (%d)", x.dir, x.n))
		}
		b.WriteString(strings.Join(parts, ", ") + "\n\n")
	}

	// Capability matrix
	b.WriteString("## Capability matrix (keyword hits per repo)\n\n")
	header := "| Capability |"
	sep := "|---|"
	for _, r := range reports {
		header += " " + r.Name + " |"
		sep += "--:|"
	}
	header += " gap? |"
	sep += ":-:|"
	b.WriteString(header + "\n" + sep + "\n")
	gapSet := map[string]bool{}
	for _, g := range gapList {
		gapSet[g] = true
	}
	for _, c := range capabilities {
		row := fmt.Sprintf("| %s |", c.ID)
		for _, r := range reports {
			row += fmt.Sprintf(" %d |", r.CapHits[c.ID])
		}
		if gapSet[c.ID] {
			row += " ⚠️ GAP |"
		} else {
			row += " |"
		}
		b.WriteString(row + "\n")
	}
	b.WriteString("\n")

	// Opportunities — capabilities peers invest far more in than self.
	opps := opportunities(matrix, selfName, others)
	b.WriteString("## Opportunities (peers invest more — ranked by ratio)\n\n")
	if len(opps) == 0 {
		b.WriteString("None — `self` matches or leads every scanned capability.\n\n")
	} else {
		b.WriteString("| Capability | self | leader | leader hits | ratio | example files (leader) |\n")
		b.WriteString("|---|--:|---|--:|--:|---|\n")
		for _, o := range opps {
			var ex []string
			for _, r := range reports {
				if r.Name == o.Leader {
					ex = r.CapFiles[o.Cap]
				}
			}
			exStr := strings.Join(ex, "; ")
			if len(exStr) > 90 {
				exStr = exStr[:90] + "…"
			}
			b.WriteString(fmt.Sprintf("| %s | %d | %s | %d | %.1fx | %s |\n", o.Cap, o.Self, o.Leader, o.Max, o.Ratio, exStr))
		}
		b.WriteString("\n")
	}

	// Gaps detail
	b.WriteString("## Gaps (present elsewhere, absent in self)\n\n")
	if len(gapList) == 0 {
		b.WriteString("None — `self` has at least one hit for every scanned capability.\n\n")
	} else {
		for _, g := range gapList {
			b.WriteString(fmt.Sprintf("### %s\n", g))
			for _, r := range reports {
				if r.Name == selfName || len(r.CapFiles[g]) == 0 {
					continue
				}
				b.WriteString(fmt.Sprintf("- %s: %s\n", r.Name, strings.Join(r.CapFiles[g], ", ")))
			}
			b.WriteString("\n")
		}
	}

	if err := os.MkdirAll(filepath.Dir(mdPath), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(mdPath, []byte(b.String()), 0o644); err != nil {
		return err
	}

	out := map[string]any{
		"reports": reports,
		"matrix":  matrix,
		"gaps":    gapList,
		"self":    selfName,
	}
	jb, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(jsonPath, jb, 0o644)
}

func main() {
	repos := flag.String("repos", "", "comma-separated source repo paths")
	self := flag.String("self", ".", "path to our own repo")
	out := flag.String("out", "parity-report.md", "markdown report output path")
	jsonOut := flag.String("json", "parity-report.json", "json report output path")
	flag.Parse()

	var reports []*repoReport
	selfName := filepath.Base(mustAbs(*self))
	r, err := scanRepo(selfName, *self)
	if err != nil {
		fmt.Fprintln(os.Stderr, "scan self:", err)
		os.Exit(1)
	}
	reports = append(reports, r)

	if *repos != "" {
		for _, p := range strings.Split(*repos, ",") {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			name := filepath.Base(mustAbs(p))
			rr, err := scanRepo(name, p)
			if err != nil {
				fmt.Fprintln(os.Stderr, "scan", p, ":", err)
				continue
			}
			reports = append(reports, rr)
		}
	}

	if err := writeReport(reports, selfName, *out, *jsonOut); err != nil {
		fmt.Fprintln(os.Stderr, "write report:", err)
		os.Exit(1)
	}
	fmt.Printf("projscan: %d repo(s) scanned → %s, %s\n", len(reports), *out, *jsonOut)
}

func mustAbs(p string) string {
	a, err := filepath.Abs(p)
	if err != nil {
		return p
	}
	return a
}

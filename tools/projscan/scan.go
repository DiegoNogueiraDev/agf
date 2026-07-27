package main

// Pure, deterministic helpers for the parity scanner. No external deps.

import (
	"regexp"
	"sort"
	"strings"
)

// Sym is an exported/top-level symbol found on a single source line.
type Sym struct {
	Kind string
	Name string
}

// Cap is a capability keyword bucket; any Term substring (case-insensitive)
// counts as a hit for the capability ID.
type Cap struct {
	ID    string
	Terms []string
}

// langForExt maps a file extension (with dot) to a scanner language tag.
func langForExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".rs":
		return "rust"
	case ".ts", ".tsx", ".mts", ".cts":
		return "ts"
	case ".py":
		return "py"
	case ".go":
		return "go"
	case ".md", ".markdown":
		return "md"
	default:
		return ""
	}
}

// skipDirs are directories never worth scanning (build output, deps, vcs).
var skipDirs = map[string]bool{
	"node_modules": true, ".git": true, "target": true, "dist": true,
	"vendor": true, "build": true, ".next": true, "coverage": true,
	".turbo": true, "out": true, "__pycache__": true,
}

// shouldSkip reports whether a directory base name should be skipped. Any
// name starting with ".bazel" is also skipped (caches/output).
func shouldSkip(name string) bool {
	if skipDirs[name] {
		return true
	}
	return strings.HasPrefix(name, ".bazel")
}

var (
	reRust = regexp.MustCompile(`^\s*pub(?:\([^)]*\))?\s+(?:async\s+)?(fn|struct|trait|enum|const|type|mod)\s+([A-Za-z_][A-Za-z0-9_]*)`)
	reTS   = regexp.MustCompile(`^\s*export\s+(?:default\s+)?(?:async\s+)?(function|class|const|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)`)
	rePy   = regexp.MustCompile(`^(?:async\s+)?(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)`)
)

// exportedSymbol extracts a public/top-level symbol from a single line for the
// given language. Rust: `pub …`; TS: `export …`; Py: top-level `def`/`class`
// (no leading indentation, so methods/nested defs are skipped).
func exportedSymbol(lang, line string) (Sym, bool) {
	var m []string
	switch lang {
	case "rust":
		m = reRust.FindStringSubmatch(line)
	case "ts":
		m = reTS.FindStringSubmatch(line)
	case "py":
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t') {
			return Sym{}, false // indented → not top-level
		}
		m = rePy.FindStringSubmatch(line)
	default:
		return Sym{}, false
	}
	if m == nil {
		return Sym{}, false
	}
	return Sym{Kind: m[1], Name: m[2]}, true
}

// capHits returns the sorted, de-duplicated capability IDs whose any term
// appears (case-insensitive substring) in the line.
func capHits(line string, caps []Cap) []string {
	low := strings.ToLower(line)
	var out []string
	seen := map[string]bool{}
	for _, c := range caps {
		for _, term := range c.Terms {
			if strings.Contains(low, strings.ToLower(term)) {
				if !seen[c.ID] {
					seen[c.ID] = true
					out = append(out, c.ID)
				}
				break
			}
		}
	}
	sort.Strings(out)
	return out
}

// Opportunity is a capability where peers invest far more than `self`.
type Opportunity struct {
	Cap    string
	Self   int
	Leader string
	Max    int
	Ratio  float64
}

// opportunities ranks capabilities by relative under-investment: for each cap
// the peer with the most hits is the leader; if self < leaderMax it's an
// opportunity with ratio = leaderMax / max(self,1). Sorted by ratio desc, then
// cap name. Capabilities we already match or lead are excluded.
func opportunities(matrix map[string]map[string]int, self string, others []string) []Opportunity {
	var out []Opportunity
	for cap, byRepo := range matrix {
		selfN := byRepo[self]
		leader, max := "", 0
		for _, o := range others {
			if byRepo[o] > max {
				max = byRepo[o]
				leader = o
			}
		}
		if max == 0 || selfN >= max {
			continue
		}
		denom := selfN
		if denom < 1 {
			denom = 1
		}
		out = append(out, Opportunity{Cap: cap, Self: selfN, Leader: leader, Max: max, Ratio: float64(max) / float64(denom)})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Ratio != out[j].Ratio {
			return out[i].Ratio > out[j].Ratio
		}
		return out[i].Cap < out[j].Cap
	})
	return out
}

// gaps returns capability IDs present in some `other` repo (>0 hits) but
// entirely absent (0 hits) in `self`. Sorted for determinism.
func gaps(matrix map[string]map[string]int, self string, others []string) []string {
	var out []string
	for cap, byRepo := range matrix {
		if byRepo[self] > 0 {
			continue
		}
		for _, o := range others {
			if byRepo[o] > 0 {
				out = append(out, cap)
				break
			}
		}
	}
	sort.Strings(out)
	return out
}

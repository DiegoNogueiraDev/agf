package main

import (
	"reflect"
	"testing"
)

func TestLangForExt(t *testing.T) {
	cases := map[string]string{
		".rs":  "rust",
		".ts":  "ts",
		".tsx": "ts",
		".py":  "py",
		".go":  "go",
		".md":  "md",
		".txt": "",
	}
	for ext, want := range cases {
		if got := langForExt(ext); got != want {
			t.Errorf("langForExt(%q) = %q, want %q", ext, got, want)
		}
	}
}

func TestShouldSkip(t *testing.T) {
	skip := []string{"node_modules", ".git", "target", "dist", "vendor", ".bazel-cache"}
	for _, d := range skip {
		if !shouldSkip(d) {
			t.Errorf("shouldSkip(%q) = false, want true", d)
		}
	}
	keep := []string{"src", "core", "codex-rs", "packages"}
	for _, d := range keep {
		if shouldSkip(d) {
			t.Errorf("shouldSkip(%q) = true, want false", d)
		}
	}
}

func TestExportedSymbolRust(t *testing.T) {
	ok := map[string]Sym{
		"pub fn foo() {":            {"fn", "foo"},
		"pub async fn baz() {":      {"fn", "baz"},
		"pub struct Bar {":          {"struct", "Bar"},
		"pub trait T {":             {"trait", "T"},
		"pub enum E {":              {"enum", "E"},
		"    pub fn indented() {":   {"fn", "indented"},
	}
	for line, want := range ok {
		got, isOk := exportedSymbol("rust", line)
		if !isOk || got != want {
			t.Errorf("rust %q = (%+v,%v), want (%+v,true)", line, got, isOk, want)
		}
	}
	for _, line := range []string{"fn private() {", "let x = 1;", "// pub fn comment"} {
		if _, isOk := exportedSymbol("rust", line); isOk {
			t.Errorf("rust %q should not be an exported symbol", line)
		}
	}
}

func TestExportedSymbolTS(t *testing.T) {
	ok := map[string]Sym{
		"export function foo(a: number) {": {"function", "foo"},
		"export async function bar() {":    {"function", "bar"},
		"export const X = 1;":              {"const", "X"},
		"export class C {":                 {"class", "C"},
		"export interface I {":             {"interface", "I"},
		"export type T = string;":          {"type", "T"},
		"export enum E {":                  {"enum", "E"},
	}
	for line, want := range ok {
		got, isOk := exportedSymbol("ts", line)
		if !isOk || got != want {
			t.Errorf("ts %q = (%+v,%v), want (%+v,true)", line, got, isOk, want)
		}
	}
	for _, line := range []string{"const y = 1;", "function local() {", "  return x;"} {
		if _, isOk := exportedSymbol("ts", line); isOk {
			t.Errorf("ts %q should not be an exported symbol", line)
		}
	}
}

func TestExportedSymbolPy(t *testing.T) {
	ok := map[string]Sym{
		"def foo():":   {"def", "foo"},
		"class C:":     {"class", "C"},
		"async def g():": {"def", "g"},
	}
	for line, want := range ok {
		got, isOk := exportedSymbol("py", line)
		if !isOk || got != want {
			t.Errorf("py %q = (%+v,%v), want (%+v,true)", line, got, isOk, want)
		}
	}
	// Indented = not top-level (method, nested) → ignored.
	for _, line := range []string{"    def method(self):", "        class Inner:"} {
		if _, isOk := exportedSymbol("py", line); isOk {
			t.Errorf("py %q should not be a top-level symbol", line)
		}
	}
}

func TestCapHits(t *testing.T) {
	caps := []Cap{
		{ID: "sandbox", Terms: []string{"sandbox", "seatbelt"}},
		{ID: "retry", Terms: []string{"retry", "rate limit"}},
	}
	got := capHits("use the seatbelt SANDBOX profile", caps)
	if !reflect.DeepEqual(got, []string{"sandbox"}) {
		t.Errorf("capHits sandbox = %v, want [sandbox]", got)
	}
	if h := capHits("nothing here", caps); len(h) != 0 {
		t.Errorf("capHits none = %v, want []", h)
	}
	if h := capHits("handle rate limit and retry", caps); !reflect.DeepEqual(h, []string{"retry"}) {
		t.Errorf("capHits retry = %v, want [retry]", h)
	}
}

func TestOpportunities(t *testing.T) {
	matrix := map[string]map[string]int{
		"reasoning": {"self": 1, "a": 300, "b": 30},
		"fuzzy":     {"self": 50, "a": 40, "b": 10}, // self >= max → não é oportunidade
		"interrupt": {"self": 10, "a": 100, "b": 20},
	}
	got := opportunities(matrix, "self", []string{"a", "b"})
	want := []Opportunity{
		{Cap: "reasoning", Self: 1, Leader: "a", Max: 300, Ratio: 300},
		{Cap: "interrupt", Self: 10, Leader: "a", Max: 100, Ratio: 10},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("opportunities = %+v, want %+v", got, want)
	}
}

func TestGaps(t *testing.T) {
	matrix := map[string]map[string]int{
		"seatbelt": {"self": 0, "codex": 5, "opencode": 0},
		"fuzzy":    {"self": 3, "codex": 1, "opencode": 2},
		"hooks":    {"self": 0, "codex": 0, "opencode": 4},
	}
	got := gaps(matrix, "self", []string{"codex", "opencode"})
	// gap = self==0 AND some other > 0
	want := []string{"hooks", "seatbelt"} // sorted
	if !reflect.DeepEqual(got, want) {
		t.Errorf("gaps = %v, want %v", got, want)
	}
}

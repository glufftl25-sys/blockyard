// Blockyard Arcade for Windows.
// Opens the arcade in its own window (Edge or Chrome app mode).
// Online it uses the live site so accounts and online games work;
// offline it plays the copy of game.html built into this file.
package main

import (
	_ "embed"
	"bytes"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

//go:embed game.html
var game []byte

const liveURL = "https://glufftl25-sys.github.io/blockyard/game.html"

func dataDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	d := filepath.Join(base, "Blockyard Arcade")
	os.MkdirAll(d, 0o755)
	return d
}

func offlineURL(dir string) string {
	p := filepath.Join(dir, "game.html")
	if old, err := os.ReadFile(p); err != nil || !bytes.Equal(old, game) {
		os.WriteFile(p, game, 0o644)
	}
	return "file:///" + strings.ReplaceAll(p, "\\", "/")
}

func online() bool {
	c := http.Client{Timeout: 4 * time.Second}
	r, err := c.Head(liveURL)
	if err != nil {
		return false
	}
	r.Body.Close()
	return r.StatusCode < 400
}

func findBrowser() string {
	var cands []string
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
		b := os.Getenv(env)
		if b == "" {
			continue
		}
		cands = append(cands,
			filepath.Join(b, "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(b, "Google", "Chrome", "Application", "chrome.exe"))
	}
	for _, c := range cands {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

func main() {
	dir := dataDir()
	url := liveURL
	if !online() {
		url = offlineURL(dir)
	}
	if b := findBrowser(); b != "" {
		cmd := exec.Command(b,
			"--app="+url,
			"--user-data-dir="+filepath.Join(dir, "profile"),
			"--window-size=1280,800",
			"--no-first-run",
			"--no-default-browser-check")
		if cmd.Start() == nil {
			return
		}
	}
	// No Edge or Chrome: open in the default browser.
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Start()
}

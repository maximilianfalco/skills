# Template for one API case: copy to <scratch>/<tag>-<case>.tape, fill the CAPS, then `vhs <file>.tape`.
# The token is read from a file in the hidden setup, so only "$TOKEN" is ever typed on camera.
# AUTH: `-H "authorization: Bearer $TOKEN"`, or delete it for a public route (an empty Bearer header gets a 401).
# BODY_FLAG: `-d @body.json` or delete it. SHOW: `jq .` for JSON, `cat` for markdown or text.

Output "OUT_DIR/TAG-CASE.gif"
Output "OUT_DIR/TAG-CASE.mp4"

Set Shell zsh
Set FontSize 18
Set Width 1400
Set Height 820
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 30ms

Env HOME "/tmp/vqa-tape-home"

Hide
Type `export API='API_URL' TOKEN=$(cat TOKEN_FILE 2>/dev/null); B=$(mktemp); clear`
Enter
Show

Type `curl -sS -X METHOD "$API/PATH" AUTH -H 'content-type: application/json' BODY_FLAG -o $B -w 'HTTP %{http_code}\n'; SHOW $B`
Enter
Sleep 3s

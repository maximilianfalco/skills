# Template: copy to <scratch>/<case>.tape, set Output and the command, then `vhs <case>.tape`.
# Point HOME at a scratch dir so no real config, token or path shows up.

Output "OUT_DIR/CASE.gif"
Output "OUT_DIR/CASE.mp4"

Set Shell zsh
Set FontSize 18
Set Width 1400
Set Height 820
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Env HOME "/tmp/vqa-tape-home"

Hide
Type "clear"
Enter
Show

Type "COMMAND; echo exit $?"
Enter
Sleep 3s

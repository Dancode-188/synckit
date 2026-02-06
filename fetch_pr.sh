#!/bin/bash
gh api repos/Dancode-188/synckit/pulls/94/files --paginate --jq '.[].filename' > /tmp/pr94_files.txt 2>&1
echo "Files fetched, exit=$?"
gh api repos/Dancode-188/synckit/pulls/94 --jq '.head.ref' > /tmp/pr94_branch.txt 2>&1
echo "Branch fetched, exit=$?"

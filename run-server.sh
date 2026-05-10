#!/bin/bash
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=2048"
exec node ./node_modules/.bin/next start -p 3000

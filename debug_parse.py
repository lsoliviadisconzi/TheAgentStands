import re

with open('/Users/leandrodisconzi/Downloads/copy-ready translation pack - PT-BR . IT . ES.md', 'r', encoding='utf-8') as f:
    content = f.read()

# The backticks are escaped in the pattern, let's fix
file_pattern = r'## \d+\) `([^`]+)`\s*\n\s*### (pt-BR|it|es)\s*\n\s*```js\s*\n(\{.*?\n\})\s*\n```'
matches = re.findall(file_pattern, content, re.DOTALL)
print(f'Found {len(matches)} matches')
for m in matches[:5]:
    print(f'  File: {m[0]}, Lang: {m[1]}')
    print(f'  JS starts: {m[2][:100]}')
    print()
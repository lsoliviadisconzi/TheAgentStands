import re

with open('/Users/leandrodisconzi/Downloads/copy-ready translation pack - PT-BR . IT . ES.md', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's look at the actual structure around the first file
idx = content.find('Elected By Rule')
print(content[idx:idx+500])
print('---')
# Find all '### ' occurrences
for m in re.finditer(r'### (pt-BR|it|es)', content):
    print(f'Found at {m.start()}: {m.group()}')
    print(content[m.start():m.start()+200])
    print('---')
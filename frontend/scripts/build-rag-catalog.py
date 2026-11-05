"""Build the frontend-only catalogue from local originals; never writes to the engine.

The catalogue also carries a lexical embedding for every document: TF-IDF over
Italian words, reduced to 3 dimensions with LSA (power iteration). No external
package or service is required, so the map is reproducible from the files and
works offline.
"""
import argparse
import hashlib
import json
import math
import random
import re
import shutil
import unicodedata
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

FRONTEND = Path(__file__).resolve().parents[1]
WORKSPACE = FRONTEND.parent.parent

STOPWORDS = set('''
 a ad al alla alle allo agli ai anche che chi ci come con cosa cose da dal dalla dalle dallo dagli
dai de del della delle dello degli dei di dove e ed era erano essere fa fare fra gli ha hanno hai ho
i il in io la le lei lo loro ma me mi mia mie mio miei ne nei nel nella nelle nello negli negl noi
non o ogni per piu piu puo qual quale quali quando quanto quanta quanti quante quel quella quelle
quelli quello questa queste questi questo se sei si sia siamo siete sono su sul sulla sulle sullo
sugli sui te ti tra tu tua tue tuo tuoi un una uno vi voi ce e sono stato stata stati state dopo
prima poi ancora solo anche molto poco tanto tutte tutti tutta tutto cui deve devono puo essere
anche nella nelle degli delle dalla dalle sullo sulla suoi sua suo loro esso essa essi esse
'''.split())

class Paragraphs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.current = [], None
    def handle_starttag(self, tag, attrs):
        if tag == 'p':
            self.current = []
    def handle_data(self, data):
        if self.current is not None:
            self.current.append(data)
    def handle_endtag(self, tag):
        if tag == 'p' and self.current is not None:
            self.parts.append(''.join(self.current))
            self.current = None

def _words(text):
    text = unicodedata.normalize('NFKD', text or '').encode('ascii', 'ignore').decode().lower()
    return [word for word in re.findall(r'[a-z]{3,}', text) if word not in STOPWORDS]


def _category(identifier):
    identifier = str(identifier or '').upper()
    if identifier.startswith('ARCH-'):
        return 'dossier'
    if identifier.startswith('G1-'):
        return 'g1'
    if identifier.startswith('G2-'):
        return 'g2'
    if identifier.startswith('G4-'):
        return 'g4'
    if identifier.startswith('G5-'):
        return 'g5'
    if identifier.startswith('LX2-'):
        return 'lazzaro'
    return 'enciclopedia'


def embed_documents(documents):
    """TF-IDF (128 dimensions) then LSA to 3 coordinates, in pure Python."""
    token_lists = []
    for doc in documents:
        # The title counts twice: it names the subject more directly than the body.
        token_lists.append(_words(doc['title']) * 2 + _words(doc['content']))
    frequency = Counter()
    for tokens in token_lists:
        frequency.update(set(tokens))
    vocabulary = {word: index for index, word in enumerate(sorted(
        word for word, count in frequency.items() if count >= 3 and len(word) >= 4))}
    rows = []
    for tokens in token_lists:
        counts = Counter(word for word in tokens if word in vocabulary)
        if not counts:
            rows.append({})
            continue
        vector = {vocabulary[word]: (1 + math.log(count)) * math.log(len(documents) / frequency[word])
                  for word, count in counts.items()}
        length = math.sqrt(sum(value * value for value in vector.values())) or 1.0
        rows.append({index: value / length for index, value in vector.items()})

    def term_vector(document_vector):
        result = [0.0] * len(vocabulary)
        for row, weight in zip(rows, document_vector):
            if weight:
                for index, value in row.items():
                    result[index] += weight * value
        return result

    def document_vector(term_weights):
        return [sum(weight * term_weights[index] for index, weight in row.items()) for row in rows]

    random.seed(113)
    components, singular_values = [], []
    for _ in range(3):
        vector = [random.uniform(-1, 1) for _ in rows]
        length = math.sqrt(sum(value * value for value in vector)) or 1.0
        vector = [value / length for value in vector]
        for _iteration in range(70):
            candidate = document_vector(term_vector(vector))
            for previous in components:
                dot = sum(a * b for a, b in zip(candidate, previous))
                candidate = [a - dot * b for a, b in zip(candidate, previous)]
            length = math.sqrt(sum(value * value for value in candidate)) or 1.0
            vector = [value / length for value in candidate]
        singular = math.sqrt(max(0.0, sum(value * value for value in term_vector(vector))))
        components.append(vector)
        singular_values.append(singular)

    coordinates = [[components[axis][index] * singular_values[axis] for axis in range(3)]
                   for index in range(len(documents))]
    for axis in range(3):
        values = sorted(coordinate[axis] for coordinate in coordinates)
        low, high = values[int(len(values) * .01)], values[min(len(values) - 1, int(len(values) * .99))]
        span = (high - low) or 1.0
        for coordinate in coordinates:
            coordinate[axis] = max(-1.0, min(1.0, (coordinate[axis] - low) / span * 2 - 1))
    return [[round(value, 6) for value in coordinate] for coordinate in coordinates], len(vocabulary)


def decode(path, day):
    text = path.read_text(encoding='utf-8')
    if day < 3 or (path.suffix.lower() == '.txt' and re.match(r'ID G\d+-\d+', text)):
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        id_match = re.search(r'(?:G\d+-\d+|LX2-\d+)', text)
        title_index = 2 if lines[0].startswith('ARCHIVIO') else 1
        body = '\n'.join(lines[title_index + 1:]).strip()
        return {'id': id_match[0], 'title': lines[title_index], 'content': body,
                'source': f'Archivio della missione · giorno {day}', 'license': ''}
    header = re.search(r'(?m)^Documento:[ \t]*([A-Z0-9_.-]+)[ \t]*\r?\n[ \t]*([^\r\n]+)\r?\n', text)
    if path.suffix.lower() == '.txt' and header:
        return {'id': header[1], 'title': header[2].strip(),
                'content': text[header.end():].strip(),
                'source': f'Archivio della missione · giorno {day}', 'license': ''}
    if path.suffix == '.json':
        data = json.loads(text)
    elif path.suffix == '.xml':
        data = {element.tag: ''.join(element.itertext()) for element in ElementTree.fromstring(text)}
    elif path.suffix == '.html':
        parser = Paragraphs()
        parser.feed(text)
        data = dict(line.split(': ', 1) for line in parser.parts)
    else:
        matches = list(re.finditer(r'(?m)^(id|title|text|source|license): ', text))
        data = {match[1]: text[match.end():matches[i+1].start() if i+1 < len(matches) else len(text)].strip()
                for i, match in enumerate(matches)}
    return {'id': data['id'], 'title': data['title'], 'content': data['text'],
            'source': data.get('source', ''), 'license': data.get('license', '')}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--day-three', type=Path, required=True, help='Directory of all day 3 originals')
    parser.add_argument('--day-three-imprevisti', type=Path,
                        help='Additional day 3 documents (defaults to the portable package imprevisti directory)')
    parser.add_argument('--day-four', type=Path,
                        help='Day 4 documents (defaults to the portable package day 4 directory)')
    args = parser.parse_args()
    package_root = WORKSPACE / 'Pacchetto_Operazione_Silenzio_PC'
    package = FRONTEND.parent / 'dati'
    day_four = args.day_four or package / 'giorno_4/documenti'
    if args.day_four and not day_four.is_dir():
        parser.error(f'Day 4 documents directory not found: {day_four}')
    imprevisti = args.day_three_imprevisti or package / 'giorno_3/imprevisti'
    extra_paths = sorted(p for p in imprevisti.iterdir() if p.is_file() and p.suffix.lower() in {'.txt', '.html', '.json', '.xml'}) if imprevisti.is_dir() else []
    if args.day_three_imprevisti and not imprevisti.is_dir():
        parser.error(f'Additional documents directory not found: {imprevisti}')
    groups = [(1, sorted((package / 'giorno_1/documenti').glob('*.txt'))),
              (2, sorted((package / 'giorno_2/documenti').glob('*.txt')) + sorted((package / 'giorno_2/imprevisti').glob('*.txt'))),
              (3, sorted(p for p in args.day_three.iterdir() if p.is_file() and p.suffix.lower() in {'.txt', '.html', '.json', '.xml'}) + extra_paths),
              (4, sorted(p for p in day_four.rglob('*') if p.is_file() and p.suffix.lower() in {'.txt', '.html', '.json', '.xml'})),
              (5, sorted((package / 'giorno_5/documenti').glob('*.txt')))]
    documents = []
    output = FRONTEND / 'public/rag'
    for day, paths in groups:
        for path in paths:
            raw = path.read_bytes()
            doc = decode(path, day)
            doc.update(key=f'g{day}/{path.name}', day=day, filename=path.name,
                       format=path.suffix[1:].upper(), bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
            assert doc['id'] and doc['title'] and doc['content'], path
            documents.append(doc)
    assert len({doc['key'] for doc in documents}) == len(documents)
    embeddings, vocabulary_size = embed_documents(documents)
    for doc, embedding in zip(documents, embeddings):
        doc['embedding'] = embedding
        doc['category'] = _category(doc['id'])
    # Finish all parsing before materializing the catalogue.
    for day, paths in groups:
        destination = output / 'files' / f'g{day}'
        destination.mkdir(parents=True, exist_ok=True)
        for path in paths:
            shutil.copyfile(path, destination / path.name)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'catalog.json').write_text(json.dumps({'version': 2, 'documents': documents,
                                                     'embedding': {'method': 'tf-idf+lsa', 'dimensions': 3,
                                                                   'vocabulary': vocabulary_size,
                                                                   'documents': len(documents)}}, ensure_ascii=False), encoding='utf-8')
    categories = Counter(doc['category'] for doc in documents)
    print(json.dumps({'total': len(documents), 'days': {day: len(paths) for day, paths in groups},
                      'categories': dict(categories)}, ensure_ascii=False))

if __name__ == '__main__':
    main()

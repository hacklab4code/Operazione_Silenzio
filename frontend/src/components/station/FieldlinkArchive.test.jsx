import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FieldlinkArchive from './FieldlinkArchive';
import { readCatalog } from './FieldlinkSourcePreview';

jest.mock('./RagSpace', () => () => <div data-testid="map" />);
jest.mock('./FieldlinkSourcePreview', () => ({ readCatalog: jest.fn(), originalUrl: (key) => `/api/fieldlink/files/${key}` }));
const sources = [
  { id: 'G4-01', key: 'giorno_4/documenti/G4-01.txt', day: 4, title: 'Fonte precedente', content: 'Testo del quarto giorno', filename: 'G4-01.txt', format: 'TXT', bytes: 30 },
  { id: 'G5-01', key: 'giorno_5/documenti/G5-01.txt', day: 5, title: 'Ultimo ordine', content: 'Procedura di sanificazione', filename: 'G5-01.txt', format: 'TXT', bytes: 40 },
  { id: 'giorno_5/missioni/Missione.xlsx', key: 'giorno_5/missioni/Missione.xlsx', day: 5, title: 'Missione.xlsx', content: 'Consegna finale del giorno 5', filename: 'Missione.xlsx', format: 'XLSX', category: 'missioni', bytes: 100 },
];
let container, root;
beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  readCatalog.mockResolvedValue(sources);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const click = async (node) => { await act(async () => node.click()); };

test('shows G5 whenever its sources are available and filters its full collection', async () => {
  await act(async () => root.render(<FieldlinkArchive />));
  const day5 = container.querySelector('[aria-label="Giorno 5, 2 documenti"]');
  expect(day5).not.toBeNull();
  await click(day5);
  await click(container.querySelector('[aria-label="Elenco"]'));
  expect(container.querySelector('.rag-document-list').textContent).toContain('Ultimo ordine');
  expect(container.querySelector('.rag-document-list').textContent).toContain('Missione.xlsx');
  expect(container.querySelector('.rag-document-list').textContent).not.toContain('Fonte precedente');
  await click(container.querySelector('[aria-label="Filtra formato XLSX"]'));
  expect(container.querySelectorAll('.rag-document-list > button')).toHaveLength(1);
  await click(container.querySelector('.rag-document-list > button'));
  expect(container.querySelector('.rag-document-text').textContent).toBe('Consegna finale del giorno 5');
  expect(container.querySelector('.rag-download').getAttribute('href')).toBe('/api/fieldlink/files/giorno_5/missioni/Missione.xlsx');
});

test('opens the exact mission file cited by its full path', async () => {
  const id = 'giorno_5/missioni/Missione.xlsx';
  await act(async () => root.render(<FieldlinkArchive latestQuery={{
    id: 'local-mission', answer: `Consulta [${id}].`, focus_id: id, source_ids: [],
  }} />));
  const inspector = container.querySelector('[data-testid="rag-inspector"]');
  expect(inspector.textContent).toContain('Consegna finale del giorno 5');
  expect(container.querySelector('.rag-resultbar').textContent).toContain('1 / 3 file');
  expect(container.querySelector('.rag-download').getAttribute('href')).toBe(`/api/fieldlink/files/${id}`);
});

# Test kapsaması

`npm run kapsama` (Node v22.23.4, yerleşik ölçüm). Kapsam: `src/**`, `bin/**`, `web/lib/**`; 54 dosya.

| Ölçüt | Çalışan / toplam | Oran | Eşik |
|---|---|---|---|
| Satır | 5032 / 5056 | %99,5 | %95 |
| Dal | 1638 / 1792 | %91,4 | %85 |
| İşlev | 575 / 587 | %98 | %95 |

En düşük satır kapsamalı on dosya:

| Dosya | Satır | Dal | İşlev |
|---|---|---|---|
| `src/molecules/costModel.js` | %92,5 | %87,1 | %100 |
| `web/lib/storage.js` | %93,3 | %100 | %88,9 |
| `src/atomic/ExactSearchAtom.js` | %94,7 | %94,1 | %87,5 |
| `src/functions/alphabet.js` | %95,1 | %94,1 | %100 |
| `bin/ios.js` | %99,4 | %86 | %96,7 |
| `src/workflows/catalog.js` | %99,5 | %84,2 | %91,4 |
| `src/adapters/sourceToEntry.js` | %100 | %100 | %100 |
| `src/atomic/AhoCorasickSearch.js` | %100 | %85,7 | %100 |
| `src/atomic/Bm4DnaDsSearch.js` | %100 | %100 | %100 |
| `src/atomic/Bm4DnaHmbsSearch.js` | %100 | %100 | %100 |

// Sunum: ok tuşları, boşluk, Page Up/Down, Home/End; slayt numarası adres çubuğunda (#3). P: yazdır.
const s = [...document.querySelectorAll('section')];
let i = Math.min(s.length - 1, Math.max(0, (parseInt(location.hash.slice(1), 10) || 1) - 1));
const show = (j) => { i = Math.min(s.length - 1, Math.max(0, j)); s.forEach((x, k) => x.classList.toggle('on', k === i)); history.replaceState(null, '', '#' + (i + 1)); };
show(i);
addEventListener('keydown', (e) => {
  if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); show(i + 1); }
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); show(i - 1); }
  else if (e.key === 'Home') show(0); else if (e.key === 'End') show(s.length - 1);
  else if (e.key === 'p' || e.key === 'P') print();
});
addEventListener('click', (e) => { if (!e.target.closest('a')) show(e.clientX > innerWidth / 3 ? i + 1 : i - 1); });

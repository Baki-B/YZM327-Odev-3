// Tema: kayıtlı tercih yoksa sistem ayarı. Sayfa çizilmeden önce çalışır (açık/koyu geçişinde
// yanıp sönme olmasın). localStorage erişilemezse sessizce geçer.
try {
  const t = localStorage.getItem('kba-tema');
  if (t) document.documentElement.dataset.theme = t;
} catch { /* özel pencere: tercih okunamaz */ }

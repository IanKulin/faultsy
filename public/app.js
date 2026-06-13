document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('time[datetime]').forEach(el => {
    el.textContent = new Date(el.getAttribute('datetime')).toLocaleString();
  });
});

import { createServer } from 'node:http';
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>PostField synthetic checkout</title>
<h1>Тестовая форма доставки</h1><form>
<label>Город<input autocomplete="address-level2" value="Москва"></label>
<label>Улица<input autocomplete="address-line1" value="Тверская улица"></label>
<label>Дом<input name="house" value="13"></label>
<label>Индекс<input autocomplete="postal-code"></label><button>Отправить</button></form>
<script>document.querySelector('form').addEventListener('submit', e => {e.preventDefault(); document.body.dataset.submitted='true'});</script></html>`;
createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html); }).listen(4173, '127.0.0.1');

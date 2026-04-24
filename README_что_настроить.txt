1. Файлы logo.png, rek.jpg, map.jpg и doma.xlsx оставь как раньше:
   - logo.png, rek.jpg, map.jpg лежат в public
   - doma.xlsx лежит рядом с server.js

2. В Render в Environment нужно добавить:
   ADMIN_PASSWORD = твой пароль
   SESSION_SECRET = любая длинная строка
   YANDEX_MAPS_API_KEY = ключ Яндекс.Карт
   YANDEX_GEOCODER_API_KEY = ключ Яндекс Геокодера
   Можно использовать один ключ для двух переменных, если Яндекс разрешает в твоем кабинете.

3. Метки берутся из Excel автоматически.
   Сервер читает улицу, дом, подъезды, этажность, квартиры.
   Координаты сохраняются в geocoded_houses.json.

4. Если файл заказчика называется иначе, лучше переименуй его в doma.xlsx.
   Но server.js теперь умеет найти первый .xlsx, если doma.xlsx нет.

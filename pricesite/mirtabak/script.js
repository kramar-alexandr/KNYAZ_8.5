// Загружаем JSON и отображаем его
fetch('../../WebTelegPriceOPT.hal')
    .then(response => response.json())
    .then(data => {
        const priceList = document.getElementById('price-list');
        const openDate = document.getElementById('open-date');
        
        // Установим текущую дату
        openDate.textContent = new Date().toLocaleDateString();

        // Преобразуем объект в массив и сортируем по количеству элементов в группе
        const sortedGroups = data.sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length);
        // Обрабатываем каждую группу
        for (const [group, items] of sortedGroups) {
            // Создаем контейнер группы
            const groupContainer = document.createElement('div');
            groupContainer.className = 'group-container w-100'; // Группа занимает всю ширину

            // Добавляем заголовок группы
            const groupTitle = document.createElement('div');
            groupTitle.className = 'group-title'; // Используем пользовательский класс
            groupTitle.innerHTML = `<h4>${group}</h4>`;
            groupContainer.appendChild(groupTitle);

            // Контейнер для товаров в два столбца
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'row row-cols-1 row-cols-md-2'; // Два столбца для товаров

            // Обрабатываем товары в группе
            for (const [name, price] of Object.entries(items)) {
                const itemElement = document.createElement('div');
                itemElement.className = 'col mb-2 item'; // Добавили класс "item" для стилей
                itemElement.innerHTML = `<span>${name}</span><span>${price}</span>`;
                itemsContainer.appendChild(itemElement);
            }

            // Добавляем контейнер товаров в группу
            groupContainer.appendChild(itemsContainer);
            
            // Добавляем контейнер группы в список
            priceList.appendChild(groupContainer);
        }
    })
    .catch(error => console.error('Ошибка загрузки данных:', error));

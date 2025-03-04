fetch('../../WebTelegPrice.hal')
    .then(response => response.json())
    .then(data => {
        const priceList = document.getElementById('price-list');
        const openDate = document.getElementById('open-date');
        
        // Установим текущую дату
        openDate.textContent = new Date().toLocaleDateString();

        // Преобразуем объект в массив и сортируем по количеству элементов в группе
        const sortedGroups = Object.entries(data).sort((a, b) => b[1].length - a[1].length);

        // Обрабатываем каждую группу
        for (const [group, items] of sortedGroups) {
            // Создаем контейнер группы
            const groupContainer = document.createElement('div');
            groupContainer.className = 'group-container'; // Новый класс для управления переносами

            // Добавляем заголовок группы
            const groupTitle = document.createElement('div');
            groupTitle.className = 'group-title'; // Используем пользовательский класс
            groupTitle.innerHTML = `<h4>${group}</h4>`;
            groupContainer.appendChild(groupTitle);

            // Обрабатываем товары в группе
            for (const [name, price] of Object.entries(items)) {
                const itemElement = document.createElement('div');
                itemElement.className = 'col mb-2 item'; // Добавили класс "item" для стилей
                itemElement.innerHTML = `<span>${name}</span><span>${price}</span>`;
                groupContainer.appendChild(itemElement);
            }

            // Добавляем контейнер группы в список
            priceList.appendChild(groupContainer);
        }
    })
    .catch(error => console.error('Ошибка загрузки данных:', error));
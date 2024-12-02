// Загружаем JSON и отображаем его
fetch('./WebTelegPrice.hal')
    .then(response => response.json())
    .then(data => {
        const priceList = document.getElementById('price-list');
        const openDate = document.getElementById('open-date');
        
        // Установим текущую дату
        openDate.textContent = new Date().toLocaleDateString();

        // Обрабатываем каждую группу
        for (const [group, items] of Object.entries(data)) {
            // Добавляем заголовок группы
            const groupTitle = document.createElement('h4');
            groupTitle.textContent = group;
            groupTitle.className = 'col-12 mt-3';
            priceList.appendChild(groupTitle);

            // Добавляем товары из группы
            items.forEach(item => {
                for (const [name, price] of Object.entries(item)) {
                    const itemElement = document.createElement('div');
                    itemElement.className = 'col mb-2';
                    itemElement.innerHTML = `<strong>${name}:</strong> ${price}`;
                    priceList.appendChild(itemElement);
                }
            });
        }
    })
    .catch(error => console.error('Ошибка загрузки данных:', error));
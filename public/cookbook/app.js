// public/cookbook/app.js - Integrated Version
(function () {
    let pantry = [];
    let appliances = [];
    let editingId = null;

    // DOM Elements - scoped to the panel in index.html
    const getElements = () => ({
        pantryList: document.getElementById('pantry-list-container'),
        pantryAddBtn: document.getElementById('pantry-add-btn'),
        appliancesContainer: document.getElementById('appliances-container'),
        mealTypeSelect: document.getElementById('meal-type-select'),
        peopleCountInput: document.getElementById('people-count-input'),
        generateBtn: document.getElementById('cookbook-generate-btn'),
        recipeSection: document.getElementById('recipe-display-section'),
        recipeContent: document.getElementById('recipe-display-content'),
        recipeCloseBtn: document.getElementById('recipe-close-btn'),
        modal: document.getElementById('pantry-modal'),
        modalTitle: document.getElementById('modal-title'),
        modalForm: document.getElementById('pantry-form'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
        itemNameInput: document.getElementById('item-name'),
        itemQtyInput: document.getElementById('item-qty'),
        itemUnitInput: document.getElementById('item-unit'),
        itemExpInput: document.getElementById('item-exp'),
    });

    const availableAppliances = [
        { id: 'piekarnik', label: 'Piekarnik' },
        { id: 'frytkownica', label: 'Frytkownica beztłuszczowa' },
        { id: 'mikrofalowka', label: 'Mikrofalówka' },
        { id: 'blender', label: 'Blender' },
        { id: 'patelnia', label: 'Patelnia' },
        { id: 'wolnowar', label: 'Wolnowar' }
    ];

    async function loadData() {
        try {
            const [pantryRes, appliancesRes] = await Promise.all([
                fetch('/api/cookbook/pantry'),
                fetch('/api/cookbook/appliances')
            ]);

            if (pantryRes.ok) {
                const data = await pantryRes.json();
                pantry = data.pantry || [];
            }
            if (appliancesRes.ok) {
                const data = await appliancesRes.json();
                appliances = data.appliances || [];
            }

            renderPantry();
            renderAppliances();
        } catch (err) {
            console.error('Błąd ładowania danych:', err);
        }
    }

    async function savePantry() {
        try {
            await fetch('/api/cookbook/pantry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pantry)
            });
        } catch (err) {
            console.error('Błąd zapisu spiżarni:', err);
        }
    }

    async function saveAppliances() {
        try {
            await fetch('/api/cookbook/appliances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appliances)
            });
        } catch (err) {
            console.error('Błąd zapisu urządzeń:', err);
        }
    }

    function renderPantry() {
        const { pantryList } = getElements();
        if (!pantryList) return;

        if (pantry.length === 0) {
            pantryList.innerHTML = '<p class="cookbook-empty">Twoja spiżarnia jest pusta.</p>';
            return;
        }

        pantryList.innerHTML = pantry.map((item, index) => `
      <div class="cookbook-item">
        <div class="cookbook-item__info">
          <span class="cookbook-item__name">${item.name}</span>
          <span class="cookbook-item__qty">${item.qty} ${item.unit || ''}</span>
          ${item.expDate ? `<span class="cookbook-item__exp">Ważne do: ${item.expDate}</span>` : ''}
        </div>
        <div class="cookbook-item__actions">
          <button onclick="window.editPantryItem(${index})" class="cookbook-btn cookbook-btn--icon" title="Edytuj">✏️</button>
          <button onclick="window.deletePantryItem(${index})" class="cookbook-btn cookbook-btn--icon" title="Usuń">🗑️</button>
        </div>
      </div>
    `).join('');
    }

    function renderAppliances() {
        const { appliancesContainer } = getElements();
        if (!appliancesContainer) return;

        appliancesContainer.innerHTML = availableAppliances.map(app => `
      <label class="cookbook-checkbox">
        <input type="checkbox" value="${app.id}" ${appliances.includes(app.id) ? 'checked' : ''} onchange="window.toggleAppliance('${app.id}')">
        <span>${app.label}</span>
      </label>
    `).join('');
    }

    window.editPantryItem = (index) => {
        const { modal, modalTitle, itemNameInput, itemQtyInput, itemUnitInput, itemExpInput } = getElements();
        const item = pantry[index];
        editingId = index;
        modalTitle.textContent = 'Edytuj produkt';
        itemNameInput.value = item.name;
        itemQtyInput.value = item.qty;
        itemUnitInput.value = item.unit || '';
        itemExpInput.value = item.expDate || '';
        modal.classList.remove('hidden');
    };

    window.deletePantryItem = async (index) => {
        if (confirm('Czy na pewno chcesz usunąć ten produkt?')) {
            pantry.splice(index, 1);
            renderPantry();
            await savePantry();
        }
    };

    window.toggleAppliance = async (id) => {
        if (appliances.includes(id)) {
            appliances = appliances.filter(a => a !== id);
        } else {
            appliances.push(id);
        }
        await saveAppliances();
    };

    async function generateRecipe() {
        const { generateBtn, recipeSection, recipeContent, mealTypeSelect, peopleCountInput } = getElements();
        const originalBtnText = generateBtn.innerHTML;
        generateBtn.disabled = true;
        generateBtn.innerHTML = '✨ Tworzenie...';

        try {
            const response = await fetch('/api/cookbook/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mealType: mealTypeSelect.value,
                    peopleCount: peopleCountInput.value
                })
            });

            const data = await response.json();
            console.log('Cookbook API Response:', data);

            if (!response.ok) {
                const errorMsg = data.error || data.message || 'Unknown server error';
                throw new Error(errorMsg);
            }

            recipeContent.innerHTML = formatMarkdown(data.recipe);
            recipeSection.classList.remove('hidden');
            recipeSection.scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            console.error('Cookbook Error:', err);
            alert(`Nie udało się wygenerować przepisu: ${err.message}`);
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerHTML = originalBtnText;
        }
    }

    function formatMarkdown(text) {
        return text
            .replace(/^### (.*$)/gim, '<h4>$1</h4>')
            .replace(/^## (.*$)/gim, '<h3>$1</h3>')
            .replace(/^# (.*$)/gim, '<h2>$1</h2>')
            .replace(/^\* (.*$)/gim, '<li>$1</li>')
            .replace(/^- (.*$)/gim, '<li>$1</li>')
            .replace(/\n\n/g, '<br><br>')
            .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>');
    }

    let isInitialized = false;
    window.initCookbook = () => {
        if (isInitialized) return;
        const el = getElements();
        if (!el.pantryAddBtn) return;

        el.pantryAddBtn.addEventListener('click', () => {
            editingId = null;
            el.modalTitle.textContent = 'Dodaj produkt';
            el.modalForm.reset();
            el.modal.classList.remove('hidden');
        });

        el.modalCancelBtn.addEventListener('click', () => el.modal.classList.add('hidden'));

        el.modalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newItem = {
                name: el.itemNameInput.value,
                qty: el.itemQtyInput.value,
                unit: el.itemUnitInput.value,
                expDate: el.itemExpInput.value
            };

            if (editingId !== null) pantry[editingId] = newItem;
            else pantry.push(newItem);

            renderPantry();
            el.modal.classList.add('hidden');
            await savePantry();
        });

        el.generateBtn.addEventListener('click', generateRecipe);
        el.recipeCloseBtn.addEventListener('click', () => el.recipeSection.classList.add('hidden'));

        loadData();
        isInitialized = true;
    };

    window.loadCookbookData = loadData;
})();

// public/cookbook/app.js - Integrated Version
(function () {
    let pantry = [];
    let appliances = [];
    let editingId = null;

    // DOM Elements
    const getElements = () => ({
        viewsContainer: document.getElementById('cookbook-views-container'),
        backBtn: document.getElementById('cookbook-back-btn'),
        viewPantryBtn: document.getElementById('view-pantry-btn'),
        viewSettingsBtn: document.getElementById('view-settings-btn'),

        pantryList: document.getElementById('pantry-list-container'),
        pantryAddBtn: document.getElementById('pantry-add-btn'),

        appliancesContainer: document.getElementById('appliances-container'),
        applianceInput: document.getElementById('appliance-input'),
        applianceAddBtn: document.getElementById('appliance-add-btn'),

        mealTypeSelect: document.getElementById('meal-type-select'),
        peopleCountInput: document.getElementById('people-count-input'),
        generateBtn: document.getElementById('cookbook-generate-btn'),
        suggestShoppingCheckbox: document.getElementById('suggest-shopping-checkbox'),
        title: document.getElementById('cookbook-title'),

        resultArea: document.getElementById('cookbook-result-area'),
        recipeSection: document.getElementById('recipe-display-section'),
        recipeContent: document.getElementById('recipe-display-content'),
        shoppingSection: document.getElementById('shopping-list-section'),
        shoppingContent: document.getElementById('shopping-list-content'),

        modal: document.getElementById('pantry-modal'),
        modalTitle: document.getElementById('modal-title'),
        modalForm: document.getElementById('pantry-form'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
        itemNameInput: document.getElementById('item-name'),
        itemQtyInput: document.getElementById('item-qty'),
        itemUnitInput: document.getElementById('item-unit'),
        itemExpInput: document.getElementById('item-exp'),
    });

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

            const { modal } = getElements();
            if (modal && !modal.classList.contains('hidden')) return;

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
                body: JSON.stringify({ pantry })
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
                body: JSON.stringify({ appliances })
            });
        } catch (err) {
            console.error('Blad zapisu urzadzen:', err);
        }
    }

    function renderPantry() {
        const { pantryList } = getElements();
        if (!pantryList) return;

        if (pantry.length === 0) {
            pantryList.innerHTML = '<p class="cookbook-empty">Twoja spizarnia jest pusta.</p>';
            return;
        }

        pantryList.innerHTML = pantry.map((item, index) => `
      <div class="cookbook-item">
        <div class="cookbook-item__info">
          <span class="cookbook-item__name">${item.name}</span>
          <span class="cookbook-item__qty">${item.qty} ${item.unit || ''}</span>
          ${item.expDate ? `<span class="cookbook-item__exp">Wazne do: ${item.expDate}</span>` : ''}
        </div>
        <div class="cookbook-item__actions">
          <button onclick="window.editPantryItem(${index})" class="cookbook-btn cookbook-btn--ghost cookbook-btn--sm" title="Edytuj">Edytuj</button>
          <button onclick="window.deletePantryItem(${index})" class="cookbook-btn cookbook-btn--ghost cookbook-btn--sm" title="Usun">Usun</button>
        </div>
      </div>
    `).join('');
    }

    function renderAppliances() {
        const { appliancesContainer } = getElements();
        if (!appliancesContainer) return;

        if (appliances.length == 0) {
            appliancesContainer.innerHTML = '<p class="cookbook-empty">Brak sprzetow. Dodaj pierwszy powyzej.</p>';
            return;
        }

        appliancesContainer.innerHTML = appliances.map((item, index) => `
      <div class="cookbook-settings-item">
        <span class="cookbook-settings-item__name">${item}</span>
        <div class="cookbook-settings-item__actions">
          <button onclick="window.deleteAppliance(${index})" class="cookbook-btn cookbook-btn--ghost cookbook-btn--sm" title="Usun">Usun</button>
        </div>
      </div>
    `).join('');
    }

    function addAppliance() {
        const { applianceInput } = getElements();
        if (!applianceInput) return;
        const raw = applianceInput.value.trim();
        if (!raw) return;
        const exists = appliances.some(item => item.toLowerCase() == raw.toLowerCase());
        if (exists) {
            applianceInput.value = '';
            return;
        }
        appliances.push(raw);
        applianceInput.value = '';
        renderAppliances();
        saveAppliances();
    }

    window.deleteAppliance = async (index) => {
        appliances.splice(index, 1);
        renderAppliances();
        await saveAppliances();
    };

    function switchView(viewName) {
        const { viewsContainer, title, backBtn } = getElements();
        if (viewsContainer) {
            viewsContainer.dataset.view = viewName;

            const titles = {
                chef: 'Twoj Kucharz',
                pantry: 'Spizarnia',
                settings: 'Ustawienia'
            };
            if (title) title.textContent = titles[viewName] || 'Kucharz AI';
        }

        if (backBtn) {
            if (viewName === 'chef') backBtn.classList.add('hidden');
            else backBtn.classList.remove('hidden');
        }
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

    async function generateRecipe() {
        const { generateBtn, recipeSection, recipeContent, shoppingSection, shoppingContent, resultArea, mealTypeSelect, peopleCountInput, suggestShoppingCheckbox } = getElements();
        const originalBtnText = generateBtn.innerHTML;
        generateBtn.disabled = true;
        generateBtn.innerHTML = 'Tworzenie...';

        try {
            const response = await fetch('/api/cookbook/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mealType: mealTypeSelect.value,
                    peopleCount: peopleCountInput.value,
                    suggestShopping: suggestShoppingCheckbox?.checked || false
                })
            });

            const data = await response.json();
            if (!response.ok) {
                const errorMsg = data.error || data.message || 'Unknown server error';
                throw new Error(errorMsg);
            }

            // Split recipe and shopping list
            const [recipeMd, shoppingMd = ''] = data.recipe.split('---SHOPPING_LIST---');

            // Set grid state first
            if (shoppingMd.trim()) {
                resultArea.classList.remove('no-shopping');
                shoppingContent.innerHTML = formatMarkdown(shoppingMd);
                shoppingSection.classList.remove('hidden');
            } else {
                resultArea.classList.add('no-shopping');
                shoppingSection.classList.add('hidden');
            }

            // Then show recipe
            recipeContent.innerHTML = formatMarkdown(recipeMd);
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
        let lines = text.split('\n');
        let html = [];
        let inTable = false;
        let inList = false;

        for (let line of lines) {
            let row = line.trim();

            if (row.startsWith('|') && row.endsWith('|')) {
                if (!inTable) { inTable = true; html.push('<table>'); }
                if (row.includes('---')) continue;
                let cells = row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
                let tag = html[html.length - 1] === '<table>' ? 'th' : 'td';
                html.push(`<tr>${cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('')}</tr>`);
                continue;
            } else if (inTable) { inTable = false; html.push('</table>'); }

            if (row.startsWith('### ')) { html.push(`<h4>${row.substring(4)}</h4>`); }
            else if (row.startsWith('## ')) { html.push(`<h3>${row.substring(3)}</h3>`); }
            else if (row.startsWith('# ')) { html.push(`<h2>${row.substring(2)}</h2>`); }
            else if (row.startsWith('* ') || row.startsWith('- ')) {
                if (!inList) { inList = true; html.push('<ul>'); }
                html.push(`<li>${row.substring(2)}</li>`);
            } else {
                if (inList) { inList = false; html.push('</ul>'); }
                if (row === '') { html.push('<br>'); }
                else { html.push(`<p>${row.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`); }
            }
        }
        if (inTable) html.push('</table>');
        if (inList) html.push('</ul>');
        return html.join('\n');
    }

    let isInitialized = false;
    window.initCookbook = () => {
        if (isInitialized) return;
        const el = getElements();

        // View Switching
        el.viewPantryBtn?.addEventListener('click', () => switchView('pantry'));
        el.viewSettingsBtn?.addEventListener('click', () => switchView('settings'));
        el.backBtn?.addEventListener('click', () => switchView('chef'));

        // Pantry Actions
        el.pantryAddBtn?.addEventListener('click', () => {
            editingId = null;
            el.modalTitle.textContent = 'Dodaj produkt';
            el.modalForm.reset();
            el.modal.classList.remove('hidden');
        });

        el.modalCancelBtn?.addEventListener('click', () => el.modal.classList.add('hidden'));

        el.modalForm?.addEventListener('submit', async (e) => {
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

        // Settings Actions
        el.applianceAddBtn?.addEventListener('click', addAppliance);
        el.applianceInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addAppliance();
            }
        });

        // Chef Actions
        el.generateBtn?.addEventListener('click', generateRecipe);

        loadData();
        isInitialized = true;
    };

    window.loadCookbookData = loadData;
})();

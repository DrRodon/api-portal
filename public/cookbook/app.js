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
        suggestShoppingCheckbox: document.getElementById('suggest-shopping-checkbox'),
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
        // Now handled in settings.html, but keeping for compatibility if needed
    };

    async function generateRecipe() {
        const { generateBtn, recipeSection, recipeContent, mealTypeSelect, peopleCountInput, suggestShoppingCheckbox } = getElements();
        const originalBtnText = generateBtn.innerHTML;
        generateBtn.disabled = true;
        generateBtn.innerHTML = '✨ Tworzenie...';

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
        let lines = text.split('\n');
        let html = [];
        let inTable = false;
        let inList = false;

        for (let line of lines) {
            let row = line.trim();

            // Tables
            if (row.startsWith('|') && row.endsWith('|')) {
                if (!inTable) {
                    inTable = true;
                    html.push('<table>');
                }
                if (row.includes('---')) continue; // Skip separator
                let cells = row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
                let tag = html[html.length - 1] === '<table>' ? 'th' : 'td';
                html.push(`<tr>${cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('')}</tr>`);
                continue;
            } else if (inTable) {
                inTable = false;
                html.push('</table>');
            }

            // Headers
            if (row.startsWith('### ')) {
                html.push(`<h4>${row.substring(4)}</h4>`);
            } else if (row.startsWith('## ')) {
                html.push(`<h3>${row.substring(3)}</h3>`);
            } else if (row.startsWith('# ')) {
                html.push(`<h2>${row.substring(2)}</h2>`);
            }
            // Lists
            else if (row.startsWith('* ') || row.startsWith('- ')) {
                if (!inList) {
                    inList = true;
                    html.push('<ul>');
                }
                html.push(`<li>${row.substring(2)}</li>`);
            } else {
                if (inList) {
                    inList = false;
                    html.push('</ul>');
                }
                if (row === '') {
                    html.push('<br>');
                } else {
                    html.push(`<p>${row.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`);
                }
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

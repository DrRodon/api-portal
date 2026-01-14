/**
 * AI Cookbook - app.js
 */

let state = {
    pantry: [],
    appliances: [],
    email: '',
    editingIndex: -1
};

const DEFAULT_APPLIANCES = [
    "Piekarnik", "Frytkownica beztłuszczowa (Air Fryer)", "Mikrofalówka",
    "Blender", "Toster", "Gofrownica", "Wyciskarka", "Multicooker"
];

// --- API Functions ---

async function fetchSession() {
    try {
        const res = await fetch('/api/session');
        const data = await res.json();
        if (data.ok) {
            state.email = data.email;
            document.getElementById('user-email').textContent = data.email;
        }
    } catch (e) {
        console.error('Session fetch failed');
    }
}

async function loadData() {
    try {
        const [pantryRes, appliancesRes] = await Promise.all([
            fetch('/api/cookbook/pantry'),
            fetch('/api/cookbook/appliances')
        ]);

        const pantryData = await pantryRes.json();
        const appliancesData = await appliancesRes.json();

        if (pantryData.ok) state.pantry = pantryData.pantry;
        if (appliancesData.ok) state.appliances = appliancesData.appliances;

        renderPantry();
        renderAppliances();
    } catch (e) {
        showToast('Błąd ładowania danych');
    }
}

async function saveData() {
    try {
        await Promise.all([
            fetch('/api/cookbook/pantry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pantry: state.pantry })
            }),
            fetch('/api/cookbook/appliances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appliances: state.appliances })
            })
        ]);
    } catch (e) {
        showToast('Błąd zapisu danych');
    }
}

async function generateRecipe() {
    const mealType = document.getElementById('meal-type').value;
    const peopleCount = document.getElementById('people-count').value;
    const btn = document.getElementById('generate-btn');
    const recipeSection = document.getElementById('recipe-section');
    const recipeContent = document.getElementById('recipe-content');

    btn.disabled = true;
    btn.textContent = '⌛ Kucharz AI myśli...';
    recipeSection.classList.remove('hidden');
    recipeContent.innerHTML = '<p class="empty-msg">Siekam warzywa, przyprawiam Gemini... 🥗</p>';
    recipeSection.scrollIntoView({ behavior: 'smooth' });

    try {
        const res = await fetch('/api/cookbook/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mealType, peopleCount })
        });
        const data = await res.json();

        if (data.ok) {
            // Simple markdown-ish to HTML conversion
            recipeContent.innerHTML = formatRecipe(data.recipe);
        } else {
            recipeContent.innerHTML = `<p class="empty-msg" style="color:red">Błąd: ${data.error || 'Nie udało się wygenerować przepisu'}</p>`;
        }
    } catch (e) {
        recipeContent.innerHTML = '<p class="empty-msg" style="color:red">Błąd połączenia z serwerem.</p>';
    } finally {
        btn.disabled = false;
        btn.textContent = '🌟 Wygeneruj Przepis (Gemini)';
    }
}

// --- UI Rendering ---

function renderPantry() {
    const list = document.getElementById('pantry-list');
    if (state.pantry.length === 0) {
        list.innerHTML = '<p class="empty-msg">Twoja spiżarnia jest pusta. Dodaj coś!</p>';
        return;
    }

    list.innerHTML = state.pantry.map((item, idx) => `
        <div class="pantry-item">
            <div class="info">
                <span class="name">${item.name}</span>
                <span class="qty">${item.qty} ${item.unit || ''}</span>
                ${item.exp ? `<span class="exp">Ważne do: ${item.exp}</span>` : ''}
            </div>
            <div class="item-actions">
                <button class="btn btn-ghost btn-sm" onclick="editItem(${idx})">✏️</button>
                <button class="btn btn-ghost btn-sm" onclick="deleteItem(${idx})">🗑️</button>
            </div>
        </div>
    `).join('');
}

function renderAppliances() {
    const grid = document.getElementById('appliances-grid');
    grid.innerHTML = DEFAULT_APPLIANCES.map(app => `
        <label class="appliance-chip">
            <input type="checkbox" value="${app}" ${state.appliances.includes(app) ? 'checked' : ''} onchange="toggleAppliance('${app}')">
            ${app}
        </label>
    `).join('');
}

// --- Logic functions ---

function toggleAppliance(app) {
    if (state.appliances.includes(app)) {
        state.appliances = state.appliances.filter(a => a !== app);
    } else {
        state.appliances.push(app);
    }
    saveData();
}

function deleteItem(idx) {
    if (confirm('Usunąć ten produkt?')) {
        state.pantry.splice(idx, 1);
        renderPantry();
        saveData();
    }
}

function editItem(idx) {
    const item = state.pantry[idx];
    state.editingIndex = idx;

    document.getElementById('modal-title').textContent = 'Edytuj Produkt';
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-qty').value = item.qty;
    document.getElementById('item-unit').value = item.unit || '';
    document.getElementById('item-exp').value = item.exp || '';

    document.getElementById('pantry-modal').classList.remove('hidden');
}

function openAddModal() {
    state.editingIndex = -1;
    document.getElementById('modal-title').textContent = 'Dodaj Produkt';
    document.getElementById('item-name').value = '';
    document.getElementById('item-qty').value = '';
    document.getElementById('item-unit').value = '';
    document.getElementById('item-exp').value = '';
    document.getElementById('pantry-modal').classList.remove('hidden');
}

function saveModal() {
    const name = document.getElementById('item-name').value.trim();
    const qty = document.getElementById('item-qty').value.trim();
    const unit = document.getElementById('item-unit').value.trim();
    const exp = document.getElementById('item-exp').value;

    if (!name) return showToast('Nazwa jest wymagana');

    const newItem = { name, qty, unit, exp };

    if (state.editingIndex > -1) {
        state.pantry[state.editingIndex] = newItem;
    } else {
        state.pantry.push(newItem);
    }

    renderPantry();
    saveData();
    document.getElementById('pantry-modal').classList.add('hidden');
}

function formatRecipe(text) {
    // Very simple MD-to-HTML
    return text
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/\n\n/g, '<br><br>')
        .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>');
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    fetchSession();
    loadData();

    document.getElementById('add-item-btn').onclick = openAddModal;
    document.getElementById('modal-cancel').onclick = () => document.getElementById('pantry-modal').classList.add('hidden');
    document.getElementById('modal-save').onclick = saveModal;
    document.getElementById('generate-btn').onclick = generateRecipe;
    document.getElementById('close-recipe').onclick = () => document.getElementById('recipe-section').classList.add('hidden');

    // Close modal on backdrop click
    document.getElementById('pantry-modal').onclick = (e) => {
        if (e.target.id === 'pantry-modal') document.getElementById('pantry-modal').classList.add('hidden');
    }
});

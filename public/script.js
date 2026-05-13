const appState = {
    items: [],
    chart: null,
    restockNote: 'Restock note: inventory looks stable right now.'
};
const LOW_STOCK_THRESHOLD = 10;

document.addEventListener('DOMContentLoaded', () => {
    applySavedTheme();

    const page = document.body.dataset.page;

    if (page === 'auth') {
        initAuthPage();
        return;
    }

    if (page === 'dashboard' || page === 'edit' || page === 'about' || page === 'contact') {
        initProtectedPage(page);
    }
});

function initAuthPage() {
    const authForm = document.getElementById('auth-form');
    const registerButton = document.getElementById('register-button');

    authForm.addEventListener('submit', loginUser);
    registerButton.addEventListener('click', registerUser);
}

async function initProtectedPage(page) {
    initShellControls();

    const logoutButton = document.getElementById('logout-button');
    const themeToggle = document.getElementById('theme-toggle');

    logoutButton.addEventListener('click', logoutUser);
    themeToggle.addEventListener('click', toggleTheme);

    document.getElementById('welcome-user').textContent =
        localStorage.getItem('inventoryUsername') || 'Private Inventory';
    updateThemeToggleLabel();

    if (page === 'dashboard') {
        document.getElementById('copy-restock-button').addEventListener('click', copyRestockNote);
    }

    if (page === 'edit') {
        const form = document.getElementById('item-form');
        const searchInput = document.getElementById('search-input');
        const categoryFilter = document.getElementById('category-filter');
        const statusFilter = document.getElementById('status-filter');

        form.addEventListener('submit', addItem);
        searchInput.addEventListener('input', renderCurrentPage);
        categoryFilter.addEventListener('change', renderCurrentPage);
        statusFilter.addEventListener('change', renderCurrentPage);
    }

    if (page === 'dashboard' || page === 'edit') {
        await loadItems();
    }
}

function initShellControls() {
    const menuToggle = document.getElementById('menu-toggle');
    const menuClose = document.getElementById('menu-close');
    const sideMenu = document.getElementById('side-menu');
    const backdrop = document.getElementById('menu-backdrop');

    if (!menuToggle || !menuClose || !sideMenu || !backdrop) {
        return;
    }

    menuToggle.addEventListener('click', () => {
        sideMenu.classList.add('menu-open');
        backdrop.classList.add('backdrop-visible');
        document.body.classList.add('menu-open');
    });

    const closeMenu = () => {
        sideMenu.classList.remove('menu-open');
        backdrop.classList.remove('backdrop-visible');
        document.body.classList.remove('menu-open');
    };

    menuClose.addEventListener('click', closeMenu);
    backdrop.addEventListener('click', closeMenu);
}

async function loginUser(event) {
    event.preventDefault();

    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    const message = document.getElementById('auth-message');

    if (!username || !password) {
        showMessage(message, 'Please enter both username and password.', true);
        return;
    }

    const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe })
    });

    const result = await readJson(response);

    if (!response.ok) {
        showMessage(message, result.message || 'Login failed.', true);
        return;
    }

    localStorage.setItem('inventoryUsername', username);
    showMessage(message, 'Login successful. Redirecting...', false);
    window.location.href = '/';
}

async function registerUser() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const message = document.getElementById('auth-message');

    if (!username || !password) {
        showMessage(message, 'Please enter both username and password.', true);
        return;
    }

    const response = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    const result = await readJson(response);
    showMessage(message, result.message || 'Account created.', !response.ok);
}

async function loadItems() {
    const response = await fetch('/items');

    if (response.status === 401) {
        window.location.href = '/login.html';
        return;
    }

    appState.items = await response.json();
    renderCurrentPage();
}

function renderCurrentPage() {
    const page = document.body.dataset.page;
    const summary = buildSummary(appState.items);

    populateCategoryFilter();
    updateSummaryCards(summary);
    renderChart(summary);
    renderRestockMission(appState.items);

    const visibleItems = page === 'edit' ? getFilteredItems() : appState.items;
    renderItems(visibleItems, {
        allowEdit: page === 'edit',
        allowDelete: true,
        emptyMessage:
            page === 'edit'
                ? 'Try changing your filters or add a new item to get started.'
                : 'No items are currently stored in the inventory.'
    });
}

function populateCategoryFilter() {
    const categoryFilter = document.getElementById('category-filter');

    if (!categoryFilter) {
        return;
    }

    const currentValue = categoryFilter.value || 'all';
    const categories = [...new Set(appState.items.map((item) => item.category))].sort();

    categoryFilter.innerHTML = '<option value="all">All Categories</option>';

    categories.forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });

    if ([...categoryFilter.options].some((option) => option.value === currentValue)) {
        categoryFilter.value = currentValue;
    }
}

function getFilteredItems() {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const statusFilter = document.getElementById('status-filter');

    if (!searchInput || !categoryFilter || !statusFilter) {
        return appState.items;
    }

    const searchValue = searchInput.value.trim().toLowerCase();
    const categoryValue = categoryFilter.value;
    const statusValue = statusFilter.value;

    return appState.items.filter((item) => {
        const searchMatch =
            item.name.toLowerCase().includes(searchValue) ||
            item.category.toLowerCase().includes(searchValue);
        const categoryMatch = categoryValue === 'all' || item.category === categoryValue;
        const statusMatch = statusValue === 'all' || getStatusDetails(item.quantity).key === statusValue;

        return searchMatch && categoryMatch && statusMatch;
    });
}

function buildSummary(items) {
    const summary = {
        total: items.length,
        low: 0,
        out: 0
    };

    items.forEach((item) => {
        const status = getStatusDetails(item.quantity);

        if (status.key === 'low-stock') {
            summary.low += 1;
        }

        if (status.key === 'out-of-stock') {
            summary.out += 1;
        }
    });

    return summary;
}

function updateSummaryCards(summary) {
    const totalElement = document.getElementById('total-items');
    const lowElement = document.getElementById('low-stock');
    const outElement = document.getElementById('out-stock');

    if (!totalElement || !lowElement || !outElement) {
        return;
    }

    totalElement.textContent = summary.total;
    lowElement.textContent = summary.low;
    outElement.textContent = summary.out;
}

function renderChart(summary) {
    const chartElement = document.getElementById('inventory-chart');

    if (!chartElement || typeof Chart === 'undefined') {
        return;
    }

    const chartData = [summary.total, summary.low, summary.out];

    if (appState.chart) {
        appState.chart.data.datasets[0].data = chartData;
        appState.chart.update();
        return;
    }

    appState.chart = new Chart(chartElement, {
        type: 'bar',
        data: {
            labels: ['Total Items', 'Low Stock', 'Out of Stock'],
            datasets: [
                {
                    label: 'Inventory Status',
                    data: chartData,
                    backgroundColor: ['#2563eb', '#f59e0b', '#dc2626'],
                    borderRadius: 8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

function renderItems(items, options) {
    const list = document.getElementById('inventory-list');

    if (!list) {
        return;
    }

    list.innerHTML = '';

    if (items.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <h4>No items found</h4>
                <p>${escapeHtml(options.emptyMessage)}</p>
            </div>
        `;
        return;
    }

    items.forEach((item) => {
        const status = getStatusDetails(item.quantity);
        const row = document.createElement('article');
        row.className = 'inventory-row';

        const actions = [];

        if (options.allowEdit) {
            actions.push('<button class="button secondary-button small-button" type="button" data-action="edit">Edit Qty</button>');
        }

        if (options.allowDelete) {
            actions.push('<button class="button danger-button small-button" type="button" data-action="delete">Delete</button>');
        }

        row.innerHTML = `
            <div class="item-main">
                <strong>${escapeHtml(item.name)}</strong>
            </div>
            <div class="item-muted">${escapeHtml(item.category)}</div>
            <div class="item-quantity">${item.quantity}</div>
            <div>
                <span class="status-badge ${status.className}">${status.label}</span>
            </div>
            <div class="row-actions">${actions.join('')}</div>
        `;

        const editButton = row.querySelector('[data-action="edit"]');
        const deleteButton = row.querySelector('[data-action="delete"]');

        if (editButton) {
            editButton.addEventListener('click', () => editItem(item.id, item.quantity));
        }

        if (deleteButton) {
            deleteButton.addEventListener('click', () => deleteItem(item.id));
        }

        list.appendChild(row);
    });
}

async function addItem(event) {
    event.preventDefault();

    const nameInput = document.getElementById('item-name');
    const quantityInput = document.getElementById('item-quantity');
    const categoryInput = document.getElementById('item-category');
    const message = document.getElementById('form-message');

    const payload = {
        name: nameInput.value.trim(),
        quantity: Number(quantityInput.value),
        category: categoryInput.value
    };

    if (!payload.name || Number.isNaN(payload.quantity) || payload.quantity < 0) {
        showMessage(message, 'Please enter a valid name and quantity.', true);
        return;
    }

    const response = await fetch('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const result = await readJson(response);

    if (!response.ok) {
        showMessage(message, result.message || 'Could not add item.', true);
        return;
    }

    event.target.reset();
    showMessage(message, 'Item added successfully.', false);
    await loadItems();
}

async function editItem(itemId, currentQuantity) {
    const newQuantity = prompt('Enter the new quantity:', currentQuantity);

    if (newQuantity === null) {
        return;
    }

    const quantity = Number(newQuantity);

    if (Number.isNaN(quantity) || quantity < 0) {
        alert('Please enter a valid number.');
        return;
    }

    await fetch(`/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity })
    });

    await loadItems();
}

async function deleteItem(itemId) {
    const confirmed = confirm('Delete this item from your inventory?');

    if (!confirmed) {
        return;
    }

    await fetch(`/items/${itemId}`, { method: 'DELETE' });
    await loadItems();
}

async function logoutUser() {
    await fetch('/logout', { method: 'POST' });
    localStorage.removeItem('inventoryUsername');
    window.location.href = '/login.html';
}

function renderRestockMission(items) {
    const scoreElement = document.getElementById('health-score');
    const messageElement = document.getElementById('health-message');
    const restockList = document.getElementById('restock-list');

    if (!scoreElement || !messageElement || !restockList) {
        return;
    }

    const healthScore = getHealthScore(items);
    const urgentItems = items
        .filter((item) => item.quantity < LOW_STOCK_THRESHOLD)
        .sort((firstItem, secondItem) => firstItem.quantity - secondItem.quantity || firstItem.name.localeCompare(secondItem.name));

    scoreElement.textContent = `${healthScore}%`;

    if (items.length === 0) {
        messageElement.textContent = 'Add a few items and this panel will build a quick restock mission for you.';
        restockList.innerHTML = `
            <div class="mission-empty">
                <p>No mission yet. Your inventory list is still empty.</p>
            </div>
        `;
        appState.restockNote = 'Restock note: no items have been added yet.';
        return;
    }

    if (urgentItems.length === 0) {
        messageElement.textContent = 'Everything is currently in stock. Nice job keeping things balanced.';
        restockList.innerHTML = `
            <div class="mission-empty">
                <p>No urgent restocks right now. You can focus on tracking new items instead.</p>
            </div>
        `;
        appState.restockNote = 'Restock note: all tracked items are currently in stock.';
        return;
    }

    if (healthScore < 50) {
        messageElement.textContent = 'Your stock health is low. These items should be checked first.';
    } else if (healthScore < 80) {
        messageElement.textContent = 'A few items need attention soon. This list helps you restock faster.';
    } else {
        messageElement.textContent = 'Only a few items need restocking. A quick shopping trip should fix it.';
    }

    restockList.innerHTML = urgentItems
        .slice(0, 5)
        .map((item) => {
            const status = getStatusDetails(item.quantity);
            const actionText = item.quantity === 0 ? 'Buy immediately' : `Top up soon: ${item.quantity} left`;

            return `
                <div class="mission-item">
                    <div>
                        <strong>${escapeHtml(item.name)}</strong>
                        <span>${escapeHtml(item.category)}</span>
                    </div>
                    <div class="mission-meta">
                        <span class="status-badge ${status.className}">${status.label}</span>
                        <small>${actionText}</small>
                    </div>
                </div>
            `;
        })
        .join('');

    appState.restockNote = buildRestockNote(urgentItems);
}

function getHealthScore(items) {
    if (items.length === 0) {
        return 72;
    }

    let stockPoints = 0;
    const uniqueCategories = new Set(items.map((item) => item.category)).size;

    items.forEach((item) => {
        if (item.quantity === 0) {
            stockPoints += 0;
        } else if (item.quantity < LOW_STOCK_THRESHOLD) {
            stockPoints += 10;
        } else {
            stockPoints += 18;
        }
    });

    const stockScore = Math.round((stockPoints / (items.length * 18)) * 75);
    const categoryBonus = Math.min(uniqueCategories * 4, 12);
    const inventoryBonus = Math.min(items.length * 3, 10);
    const finalScore = stockScore + categoryBonus + inventoryBonus;

    return Math.min(finalScore, 97);
}

function buildRestockNote(items) {
    const lines = items.slice(0, 5).map((item) => {
        const status = getStatusDetails(item.quantity).label;
        return `- ${item.name} (${item.category}) - ${status}, quantity: ${item.quantity}`;
    });

    return ['Restock Mission', ...lines].join('\n');
}

async function copyRestockNote() {
    const message = document.getElementById('restock-message');

    if (!navigator.clipboard) {
        showMessage(message, 'Clipboard is not available in this browser.', true);
        return;
    }

    try {
        await navigator.clipboard.writeText(appState.restockNote);
        showMessage(message, 'Restock note copied.', false);
    } catch (error) {
        showMessage(message, 'Could not copy the restock note.', true);
    }
}

function toggleTheme() {
    const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    setTheme(nextTheme);
}

function applySavedTheme() {
    const savedTheme = localStorage.getItem('inventoryTheme') || 'light';
    setTheme(savedTheme);
}

function setTheme(theme) {
    document.body.classList.toggle('dark-mode', theme === 'dark');
    localStorage.setItem('inventoryTheme', theme);
    updateThemeToggleLabel();
}

function updateThemeToggleLabel() {
    const themeToggle = document.getElementById('theme-toggle');

    if (!themeToggle) {
        return;
    }

    themeToggle.textContent = document.body.classList.contains('dark-mode') ? 'Light Mode' : 'Dark Mode';
}

function getStatusDetails(quantity) {
    if (quantity === 0) {
        return {
            key: 'out-of-stock',
            label: 'Out of Stock',
            className: 'status-out'
        };
    }

    if (quantity < LOW_STOCK_THRESHOLD) {
        return {
            key: 'low-stock',
            label: 'Low Stock',
            className: 'status-low'
        };
    }

    return {
        key: 'in-stock',
        label: 'In Stock',
        className: 'status-in'
    };
}

function showMessage(element, text, isError) {
    if (!element) {
        return;
    }

    element.textContent = text;
    element.classList.toggle('error-message', isError);
    element.classList.toggle('success-message', !isError);
}

async function readJson(response) {
    try {
        return await response.json();
    } catch (error) {
        return {};
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

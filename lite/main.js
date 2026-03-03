import { initializeApp } from 'firebase/app';
import { getDatabase, get, ref, remove, runTransaction, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyA2Ho46OlQUOWWn0YByV2s7OEt8UaiDaBw',
  authDomain: 'inventory-b4e64.firebaseapp.com',
  projectId: 'inventory-b4e64',
  storageBucket: 'inventory-b4e64.firebasestorage.app',
  databaseURL: 'https://inventory-b4e64-default-rtdb.europe-west1.firebasedatabase.app',
  messagingSenderId: '270341337460',
  appId: '1:270341337460:web:03f0affaf2a684b804fc21',
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const form = document.getElementById('item-form');
const categorySelect = document.getElementById('category');
const itemsRoot = document.getElementById('items');
const searchInput = document.getElementById('search');
const refreshBtn = document.getElementById('refresh-btn');
const statusLine = document.getElementById('status-line');

let allItems = [];

function line(text) {
  statusLine.textContent = text;
}

function safe(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadCategories() {
  const snap = await get(ref(db, 'categories'));
  const categoriesMap = snap.val() || {};
  const list = Object.values(categoriesMap)
    .filter((c) => !c.deleted)
    .map((c) => c.name)
    .sort();

  categorySelect.innerHTML = '';
  list.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    categorySelect.appendChild(option);
  });
}

function itemMatches(item, term) {
  const q = term.toLowerCase();
  return [item.name, item.serialNumber, item.brand, item.model].some((v) =>
    String(v || '')
      .toLowerCase()
      .includes(q),
  );
}

function renderItems(items) {
  if (items.length === 0) {
    itemsRoot.innerHTML = '<div class="item">Aucun item</div>';
    return;
  }

  itemsRoot.innerHTML = items
    .map(
      (item) => `
      <div class="item">
        <div class="item-meta">
          <strong>${safe(item.name)}</strong>
          <span>Serial: ${safe(item.serialNumber)}</span>
          <span>Cat: ${safe(item.category)} | Qty: ${safe(item.quantity)} | Statut: ${safe(item.status)}</span>
          <span>Marque/Modele: ${safe(item.brand || '-')} / ${safe(item.model || '-')}</span>
        </div>
        <button class="danger" data-id="${safe(item.id)}">Supprimer</button>
      </div>
    `,
    )
    .join('');

  itemsRoot.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!id) return;
      await remove(ref(db, `items/${id}`));
      line(`Item ${id} supprime.`);
      await loadItems();
    });
  });
}

async function loadItems() {
  const snap = await get(ref(db, 'items'));
  const map = snap.val() || {};
  allItems = Object.values(map).sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  const term = searchInput.value.trim();
  const filtered = term ? allItems.filter((i) => itemMatches(i, term)) : allItems;
  renderItems(filtered);
  line(`${filtered.length} item(s) affiches.`);
}

async function nextItemId() {
  const counterRef = ref(db, 'meta/counters/items');
  const tx = await runTransaction(counterRef, (current) => (typeof current === 'number' ? current + 1 : 1));
  if (!tx.committed) throw new Error('Counter items not committed');
  return Number(tx.snapshot.val());
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const id = await nextItemId();
    const payload = {
      id,
      serialNumber: document.getElementById('serialNumber').value.trim(),
      name: document.getElementById('name').value.trim(),
      brand: document.getElementById('brand').value.trim(),
      model: document.getElementById('model').value.trim(),
      category: categorySelect.value,
      quantity: Number(document.getElementById('quantity').value || 1),
      status: document.getElementById('status').value,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    if (!payload.serialNumber || !payload.name) {
      line('Serial et nom obligatoires.');
      return;
    }

    await set(ref(db, `items/${id}`), payload);
    await set(ref(db, `notifications/${Date.now()}`), {
      id: Date.now(),
      type: 'item_created',
      message: `Item cree: ${payload.name}`,
      itemSerialNumber: payload.serialNumber,
      created_at: new Date().toISOString(),
      timestamp: new Date().toISOString(),
    });

    form.reset();
    document.getElementById('quantity').value = '1';
    line(`Item ${payload.name} enregistre.`);
    await loadItems();
  } catch (err) {
    line(`Erreur: ${err instanceof Error ? err.message : 'inconnue'}`);
  }
});

searchInput.addEventListener('input', () => {
  const term = searchInput.value.trim();
  const filtered = term ? allItems.filter((i) => itemMatches(i, term)) : allItems;
  renderItems(filtered);
});

refreshBtn.addEventListener('click', loadItems);

async function init() {
  line('Connexion Firebase...');
  await loadCategories();
  await loadItems();
  line('Pret.');
}

init().catch((err) => {
  line(`Init error: ${err instanceof Error ? err.message : 'inconnue'}`);
});

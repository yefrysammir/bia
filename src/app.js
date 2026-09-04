// ============================================
// SHOP APP v2 - Google Sheets Sync + PWA + Seguridad
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURACIÓN (desde variables de entorno)
    // ============================================
    
    // Se cargan desde las variables de entorno en tiempo de build
    const CONFIG = {
        whatsappNumber: '51958849621', // Sobrescrito por API
        currency: 'PEN',
        currencySymbol: 'S/',
        appName: 'Mi Tienda Shop'
    };

    // ============================================
    // ESTADO
    // ============================================
    const state = {
        products: [],
        cart: JSON.parse(localStorage.getItem('shop_cart_v2') || '[]'),
        filter: 'Todos',
        search: '',
        modalProduct: null,
        modalQty: 1,
        currentImageIndex: 0,
        isSyncing: false
    };

    // ============================================
    // DOM ELEMENTS
    // ============================================
    const els = {};

    function cacheElements() {
        els.grid = document.getElementById('products-grid');
        els.cartCount = document.getElementById('cart-count');
        els.cartSidebar = document.getElementById('cart-sidebar');
        els.cartOverlay = document.getElementById('cart-overlay');
        els.cartItems = document.getElementById('cart-items');
        els.cartTotal = document.getElementById('cart-total');
        els.cartSubtotal = document.getElementById('cart-subtotal');
        els.cartDiscount = document.getElementById('cart-discount');
        els.modal = document.getElementById('product-modal');
        els.modalBody = document.getElementById('modal-body');
        els.searchInput = document.getElementById('search-input');
        els.searchClear = document.getElementById('search-clear');
        els.filterChips = document.getElementById('filter-chips');
        els.toastContainer = document.getElementById('toast-container');
        els.syncStatus = document.getElementById('sync-status');
        els.syncNowBtn = document.getElementById('sync-now-btn');
        els.header = document.getElementById('main-header');
    }

    // ============================================
    // FORMATO DE MONEDA
    // ============================================
    function formatPrice(price) {
        return `${CONFIG.currencySymbol} ${price.toFixed(2)}`;
    }

    // ============================================
    // TOAST
    // ============================================
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = 'toast';
        const icon = type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'check_circle';
        toast.innerHTML = `<span class="material-symbols-outlined ms-w500-fill">${icon}</span> ${message}`;
        els.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function setSyncStatus(text, type = 'idle') {
        if (!els.syncStatus) return;
        const icons = {
            idle: 'cloud_sync',
            loading: 'sync',
            success: 'check_circle',
            error: 'sync_problem',
            warning: 'warning'
        };
        const icon = icons[type] || 'cloud_sync';
        const loadingClass = type === 'loading' ? 'loading' : '';
        els.syncStatus.innerHTML = `
            <span class="material-symbols-outlined ms-w500 ${loadingClass}">${icon}</span> 
            ${text}
        `;
        els.syncStatus.className = `sync-status ${type}`;
    }

    // ============================================
    // CARGAR PRODUCTOS DESDE API
    // ============================================
    async function loadProducts() {
        if (state.isSyncing) return;
        state.isSyncing = true;
        
        setSyncStatus('Sincronizando catálogo...', 'loading');

        try {
            const response = await fetch('/api/sync-products');
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Error al sincronizar');
            }

            if (data.products && data.products.length > 0) {
                state.products = data.products;
                localStorage.setItem('shop_products_cache', JSON.stringify(data.products));
                setSyncStatus(`✅ ${data.count} productos sincronizados`, 'success');
                renderAll();
                showToast(`¡${data.count} productos cargados!`);
            } else {
                throw new Error('No se encontraron productos');
            }

        } catch (error) {
            console.error('Error:', error);
            setSyncStatus('⚠️ Usando caché local', 'warning');
            
            // Fallback a caché
            const cached = localStorage.getItem('shop_products_cache');
            if (cached) {
                try {
                    state.products = JSON.parse(cached);
                    renderAll();
                    showToast('Usando datos en caché', 'warning');
                } catch (e) {
                    await loadFromLocalJSON();
                }
            } else {
                await loadFromLocalJSON();
            }
        } finally {
            state.isSyncing = false;
        }
    }

    async function loadFromLocalJSON() {
        try {
            const res = await fetch('/src/products.json');
            const data = await res.json();
            state.products = data;
            localStorage.setItem('shop_products_cache', JSON.stringify(data));
            setSyncStatus('📦 Catálogo local cargado', 'success');
            renderAll();
        } catch (e) {
            setSyncStatus('❌ Error al cargar productos', 'error');
            showToast('Error al cargar el catálogo', 'error');
        }
    }

    // ============================================
    // RENDER
    // ============================================
    function renderAll() {
        renderFilters();
        renderProducts();
        updateCartUI();
    }

    function renderFilters() {
        const categories = ['Todos', ...new Set(state.products.map(p => p.category))];
        
        // Scroll horizontal con estilo moderno
        els.filterChips.innerHTML = `
            <div class="filter-scroll">
                ${categories.map(cat => `
                    <button class="filter-chip ${state.filter === cat ? 'active' : ''}" data-cat="${cat}">
                        ${cat}
                    </button>
                `).join('')}
            </div>
        `;

        els.filterChips.querySelectorAll('.filter-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                state.filter = btn.dataset.cat;
                renderFilters();
                renderProducts();
            });
        });
    }

    function renderProducts() {
        let filtered = state.products;

        if (state.filter !== 'Todos') {
            filtered = filtered.filter(p => p.category === state.filter);
        }

        if (state.search.trim()) {
            const q = state.search.toLowerCase();
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(q) ||
                p.code.toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q)
            );
        }

        if (filtered.length === 0) {
            els.grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:80px 20px">
                    <span class="material-symbols-outlined ms-w300" style="font-size:64px;color:var(--text-placeholder);margin-bottom:16px;display:block">search_off</span>
                    <p style="font-size:16px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">No se encontraron productos</p>
                    <p style="font-size:13px;color:var(--text-muted)">Intenta con otra búsqueda o categoría</p>
                </div>`;
            return;
        }

        els.grid.innerHTML = filtered.map(p => {
            const finalPrice = p.discount > 0
                ? p.price * (1 - p.discount / 100)
                : p.price;

            const badgeClass = p.badge === 'Oferta' || p.badge?.toLowerCase() === 'oferta' ? 'badge-sale' :
                             p.badge === 'Nuevo' || p.badge?.toLowerCase() === 'nuevo' ? 'badge-new' :
                             p.badge === 'Mas vendido' || p.badge?.toLowerCase() === 'mas vendido' ? 'badge-hot' :
                             p.badge === 'Edicion limitada' || p.badge?.toLowerCase() === 'edicion limitada' ? 'badge-limited' : '';

            return `
                <div class="product-card" data-id="${p.id}">
                    <div class="product-image-wrap">
                        <img src="${p.image}" alt="${p.name}" loading="lazy"
                            onerror="this.src='https://via.placeholder.com/400x400?text=Sin+imagen'">
                        ${p.badge ? `<span class="badge ${badgeClass}">${p.badge}</span>` : ''}
                        ${p.discount > 0 ? `<span class="discount-pill">-${p.discount}%</span>` : ''}
                    </div>
                    <div class="product-info">
                        <div class="product-category">${p.category}</div>
                        <div class="product-name">${p.name}</div>
                        <div class="product-code">Código: ${p.code}</div>
                        <div class="price-row">
                            <span class="price-current">${formatPrice(finalPrice)}</span>
                            ${p.discount > 0 ? `<span class="price-original">${formatPrice(p.price)}</span>` : ''}
                        </div>
                        <div class="product-actions">
                            <button class="btn btn-primary add-cart-btn" data-id="${p.id}">
                                <span class="material-symbols-outlined ms-18">shopping_bag</span>
                                Agregar
                            </button>
                            <button class="btn btn-whatsapp wa-direct-btn" data-id="${p.id}">
                                <span class="material-symbols-outlined ms-18">chat</span>
                                WhatsApp
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Event listeners
        els.grid.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn')) return;
                openModal(card.dataset.id);
            });
        });

        els.grid.querySelectorAll('.add-cart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                addToCart(btn.dataset.id, 1);
            });
        });

        els.grid.querySelectorAll('.wa-direct-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                buyDirectWhatsApp(btn.dataset.id);
            });
        });
    }

    // ============================================
    // MODAL CON TOUCH
    // ============================================
    function openModal(productId) {
        const p = state.products.find(x => x.id === productId);
        if (!p) return;

        state.modalProduct = p;
        state.modalQty = 1;
        state.currentImageIndex = 0;

        const finalPrice = p.discount > 0 ? p.price * (1 - p.discount / 100) : p.price;

        els.modalBody.innerHTML = `
            <div class="modal-gallery" id="modal-gallery">
                <div class="modal-gallery-track" id="modal-gallery-track">
                    ${p.gallery.map(img => `
                        <img src="${img}" alt="${p.name}" class="modal-gallery-slide"
                            onerror="this.src='https://via.placeholder.com/600x600?text=Sin+imagen'">
                    `).join('')}
                </div>
                ${p.gallery.length > 1 ? `
                    <button class="gallery-nav gallery-nav-left" id="gallery-prev">
                        <span class="material-symbols-outlined">chevron_left</span>
                    </button>
                    <button class="gallery-nav gallery-nav-right" id="gallery-next">
                        <span class="material-symbols-outlined">chevron_right</span>
                    </button>
                    <div class="gallery-dots">
                        ${p.gallery.map((_, i) => `
                            <button class="gallery-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
            <div class="modal-details">
                <div class="modal-category">${p.category}</div>
                <h2 class="modal-title">${p.name}</h2>
                <div class="modal-code">Código: ${p.code}</div>
                <div class="modal-price-row">
                    <span class="modal-price">${formatPrice(finalPrice)}</span>
                    ${p.discount > 0 ? `<span class="modal-price-old">${formatPrice(p.price)}</span>` : ''}
                    ${p.discount > 0 ? `<span class="modal-discount">-${p.discount}% OFF</span>` : ''}
                </div>
                <p class="modal-desc">${p.description}</p>
                <div class="modal-features">
                    <h4>Características principales</h4>
                    <ul>${p.features.map(f => `<li><span class="material-symbols-outlined ms-w500-fill">check_circle</span>${f}</li>`).join('')}</ul>
                </div>
                <div class="modal-stock">Stock disponible: <span>${p.stock} unidades</span></div>
                <div class="modal-actions">
                    <div class="qty-selector">
                        <button id="modal-qty-minus"><span class="material-symbols-outlined ms-18">remove</span></button>
                        <input type="text" id="modal-qty-input" value="1" readonly>
                        <button id="modal-qty-plus"><span class="material-symbols-outlined ms-18">add</span></button>
                    </div>
                    <button class="btn btn-primary" id="modal-add-cart" style="flex:2">
                        <span class="material-symbols-outlined ms-18">shopping_bag</span>
                        Agregar al carrito
                    </button>
                    <button class="btn btn-whatsapp" id="modal-wa-btn" style="flex:2">
                        <span class="material-symbols-outlined ms-18">chat</span>
                        Comprar por WhatsApp
                    </button>
                </div>
            </div>
        `;

        els.modal.classList.add('active');
        document.body.classList.add('modal-open');

        // Setup gallery navigation
        setupGallery(p);

        // Qty controls
        document.getElementById('modal-qty-minus').addEventListener('click', () => {
            if (state.modalQty > 1) { state.modalQty--; updateModalQty(); }
        });
        document.getElementById('modal-qty-plus').addEventListener('click', () => {
            if (state.modalQty < p.stock) { state.modalQty++; updateModalQty(); }
            else showToast('No hay más stock disponible', 'warning');
        });

        document.getElementById('modal-add-cart').addEventListener('click', () => {
            addToCart(p.id, state.modalQty);
            closeModal();
        });

        document.getElementById('modal-wa-btn').addEventListener('click', () => {
            buyDirectWhatsApp(p.id, state.modalQty);
            closeModal();
        });
    }

    function setupGallery(p) {
        const track = document.getElementById('modal-gallery-track');
        const dots = document.querySelectorAll('.gallery-dot');
        const prevBtn = document.getElementById('gallery-prev');
        const nextBtn = document.getElementById('gallery-next');
        let currentIndex = 0;
        const total = p.gallery.length;

        if (total <= 1) return;

        function goTo(index) {
            currentIndex = (index + total) % total;
            track.style.transform = `translateX(-${currentIndex * 100}%)`;
            dots.forEach((dot, i) => dot.classList.toggle('active', i === currentIndex));
        }

        // Botones
        prevBtn?.addEventListener('click', () => goTo(currentIndex - 1));
        nextBtn?.addEventListener('click', () => goTo(currentIndex + 1));

        // Dots
        dots.forEach((dot, i) => {
            dot.addEventListener('click', () => goTo(i));
        });

        // ===== TOUCH =====
        let startX = 0;
        let isDragging = false;
        const galleryEl = document.getElementById('modal-gallery');

        galleryEl.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
        }, { passive: true });

        galleryEl.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            const endX = e.changedTouches[0].clientX;
            const diff = startX - endX;

            if (Math.abs(diff) > 30) {
                if (diff > 0) {
                    goTo(currentIndex + 1);
                } else {
                    goTo(currentIndex - 1);
                }
            }
        }, { passive: true });
    }

    function updateModalQty() {
        document.getElementById('modal-qty-input').value = state.modalQty;
    }

    function closeModal() {
        els.modal.classList.remove('active');
        document.body.classList.remove('modal-open');
        state.modalProduct = null;
    }

    // ============================================
    // CARRITO
    // ============================================
    function addToCart(productId, qty) {
        const p = state.products.find(x => x.id === productId);
        if (!p) return;

        const existing = state.cart.find(item => item.id === productId);
        if (existing) {
            existing.qty = Math.min(existing.qty + qty, p.stock);
        } else {
            state.cart.push({
                id: p.id,
                code: p.code,
                name: p.name,
                price: p.discount > 0 ? p.price * (1 - p.discount / 100) : p.price,
                originalPrice: p.price,
                image: p.image,
                qty: qty
            });
        }

        saveCart();
        updateCartUI();
        showToast(`${p.name} agregado al carrito`);
        animateCartIcon();
    }

    function removeFromCart(productId) {
        state.cart = state.cart.filter(item => item.id !== productId);
        saveCart();
        updateCartUI();
    }

    function updateCartQty(productId, delta) {
        const item = state.cart.find(i => i.id === productId);
        const product = state.products.find(p => p.id === productId);
        if (!item || !product) return;

        const newQty = item.qty + delta;
        if (newQty < 1) {
            removeFromCart(productId);
        } else if (newQty <= product.stock) {
            item.qty = newQty;
            saveCart();
            updateCartUI();
        } else {
            showToast('No hay más stock disponible', 'warning');
        }
    }

    function saveCart() {
        localStorage.setItem('shop_cart_v2', JSON.stringify(state.cart));
    }

    function updateCartUI() {
        const totalItems = state.cart.reduce((sum, i) => sum + i.qty, 0);
        els.cartCount.textContent = totalItems;
        els.cartCount.style.display = totalItems > 0 ? 'flex' : 'none';

        if (state.cart.length === 0) {
            els.cartItems.innerHTML = `
                <div class="cart-empty">
                    <span class="material-symbols-outlined ms-w300">shopping_bag</span>
                    <p>Tu carrito está vacío</p>
                </div>`;
            els.cartSubtotal.textContent = formatPrice(0);
            els.cartDiscount.textContent = formatPrice(0);
            els.cartTotal.textContent = formatPrice(0);
            return;
        }

        els.cartItems.innerHTML = state.cart.map(item => `
            <div class="cart-item">
                <img class="cart-item-img" src="${item.image}" alt="${item.name}"
                    onerror="this.src='https://via.placeholder.com/72x72?text=?'">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-code">${item.code}</div>
                    <div class="cart-item-price">${formatPrice(item.price * item.qty)}</div>
                    <div class="cart-item-qty">
                        <button class="cart-qty-minus" data-id="${item.id}"><span class="material-symbols-outlined ms-14">remove</span></button>
                        <span>${item.qty}</span>
                        <button class="cart-qty-plus" data-id="${item.id}"><span class="material-symbols-outlined ms-14">add</span></button>
                    </div>
                </div>
                <button class="cart-item-remove" data-id="${item.id}">
                    <span class="material-symbols-outlined ms-16">delete</span>
                </button>
            </div>
        `).join('');

        // Listeners
        els.cartItems.querySelectorAll('.cart-qty-minus').forEach(btn => {
            btn.addEventListener('click', () => updateCartQty(btn.dataset.id, -1));
        });
        els.cartItems.querySelectorAll('.cart-qty-plus').forEach(btn => {
            btn.addEventListener('click', () => updateCartQty(btn.dataset.id, 1));
        });
        els.cartItems.querySelectorAll('.cart-item-remove').forEach(btn => {
            btn.addEventListener('click', () => removeFromCart(btn.dataset.id));
        });

        // Totales
        const subtotal = state.cart.reduce((sum, i) => sum + i.originalPrice * i.qty, 0);
        const total = state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
        const discount = subtotal - total;

        els.cartSubtotal.textContent = formatPrice(subtotal);
        els.cartDiscount.textContent = '-' + formatPrice(discount);
        els.cartTotal.textContent = formatPrice(total);
    }

    function animateCartIcon() {
        const btn = document.getElementById('cart-btn');
        btn.style.transform = 'scale(1.15)';
        setTimeout(() => btn.style.transform = 'scale(1)', 200);
    }

    // ============================================
    // WHATSAPP
    // ============================================
    function buildWhatsAppMessage(items) {
        const lines = items.map(item => {
            const total = (item.price * item.qty).toFixed(2);
            return `• ${item.name} (${item.code})\n  Cantidad: ${item.qty}\n  Precio: ${formatPrice(item.price * item.qty)}`;
        });

        const grandTotal = items.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2);

        return `¡Hola! 👋 Quiero realizar un pedido:\n\n${lines.join('\n\n')}\n\n*Total: ${formatPrice(parseFloat(grandTotal))}*\n\nGracias 😊`;
    }

    function getWhatsAppNumber() {
        // El número se obtiene del backend via API
        return CONFIG.whatsappNumber || '51958849621';
    }

    function buyDirectWhatsApp(productId, qty = 1) {
        const p = state.products.find(x => x.id === productId);
        if (!p) return;

        const finalPrice = p.discount > 0 ? p.price * (1 - p.discount / 100) : p.price;
        const item = {
            name: p.name,
            code: p.code,
            qty: qty,
            price: finalPrice
        };

        const msg = buildWhatsAppMessage([item]);
        const url = `https://wa.me/${getWhatsAppNumber()}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    }

    function buyCartWhatsApp() {
        if (state.cart.length === 0) {
            showToast('El carrito está vacío', 'warning');
            return;
        }

        const msg = buildWhatsAppMessage(state.cart);
        const url = `https://wa.me/${getWhatsAppNumber()}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    }

    // ============================================
    // PWA
    // ============================================
    function initPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/src/sw.js')
                .then(() => console.log('✅ Service Worker registrado'))
                .catch(err => console.log('❌ SW error:', err));
        }
    }

    // ============================================
    // EVENTOS
    // ============================================
    function initEvents() {
        // Búsqueda
        els.searchInput.addEventListener('input', (e) => {
            state.search = e.target.value;
            renderProducts();
            if (state.search.trim().length > 0) {
                els.searchClear.classList.add('visible');
            } else {
                els.searchClear.classList.remove('visible');
            }
        });

        els.searchClear.addEventListener('click', () => {
            els.searchInput.value = '';
            state.search = '';
            els.searchClear.classList.remove('visible');
            renderProducts();
            els.searchInput.focus();
        });

        // Header scroll
        window.addEventListener('scroll', () => {
            if (window.scrollY > 10) {
                els.header.classList.add('scrolled');
            } else {
                els.header.classList.remove('scrolled');
            }
        });

        // Carrito
        document.getElementById('cart-btn').addEventListener('click', () => {
            els.cartSidebar.classList.add('open');
            els.cartOverlay.classList.add('active');
            document.body.classList.add('cart-open');
        });

        document.getElementById('cart-close').addEventListener('click', closeCart);
        els.cartOverlay.addEventListener('click', closeCart);

        function closeCart() {
            els.cartSidebar.classList.remove('open');
            els.cartOverlay.classList.remove('active');
            document.body.classList.remove('cart-open');
        }

        // Modal
        document.getElementById('modal-close').addEventListener('click', closeModal);
        els.modal.addEventListener('click', (e) => {
            if (e.target === els.modal) closeModal();
        });

        // WhatsApp carrito
        document.getElementById('cart-wa-btn').addEventListener('click', buyCartWhatsApp);

        // Botón sincronizar
        if (els.syncNowBtn) {
            els.syncNowBtn.addEventListener('click', async () => {
                els.syncNowBtn.classList.add('spinning');
                await loadProducts();
                setTimeout(() => els.syncNowBtn.classList.remove('spinning'), 1000);
            });
        }

        // Teclado
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
                closeCart();
            }
        });
    }

    // ============================================
    // INIT
    // ============================================
    document.addEventListener('DOMContentLoaded', () => {
        cacheElements();
        loadProducts();
        initEvents();
        initPWA();
    });

})();
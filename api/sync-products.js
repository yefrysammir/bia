// ============================================
// API de sincronización con Google Sheets
// Endpoint: /api/sync-products
// ============================================

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

export default async function handler(req, res) {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Verificar que las variables de entorno existen
        if (!GOOGLE_SHEET_ID || !GOOGLE_API_KEY) {
            return res.status(500).json({
                success: false,
                error: 'Configuración de Google Sheets incompleta'
            });
        }

        // Obtener datos de Google Sheets
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Productos?key=${GOOGLE_API_KEY}`;
        
        const response = await fetch(url, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) {
            throw new Error(`Error en Google Sheets API: ${response.status}`);
        }

        const data = await response.json();

        if (!data.values || data.values.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No se encontraron datos en la hoja'
            });
        }

        // Procesar datos
        const headers = data.values[0];
        const rows = data.values.slice(1);

        const products = rows.map((row, index) => {
            const getVal = (colName) => {
                const idx = headers.indexOf(colName);
                return idx !== -1 ? (row[idx] || '').trim() : '';
            };

            return {
                id: getVal('ID') || `PROD-${String(index + 1).padStart(3, '0')}`,
                code: getVal('Codigo') || getVal('Código') || '',
                name: getVal('Nombre') || 'Sin nombre',
                category: getVal('Categoria') || getVal('Categoría') || 'General',
                price: parseFloat(getVal('Precio')) || 0,
                discount: parseInt(getVal('Descuento')) || 0,
                currency: getVal('Moneda') || 'PEN',
                stock: parseInt(getVal('Stock')) || 0,
                description: getVal('Descripcion') || getVal('Descripción') || '',
                features: getVal('Caracteristicas') ? 
                    getVal('Caracteristicas').split(/[,;]/).map(f => f.trim()).filter(Boolean) : 
                    [],
                image: getVal('Imagen') || 'https://via.placeholder.com/400x400?text=Sin+imagen',
                gallery: getVal('Galeria') ? 
                    getVal('Galeria').split(/[,;]/).map(f => f.trim()).filter(Boolean) : 
                    [getVal('Imagen') || 'https://via.placeholder.com/400x400?text=Sin+imagen'],
                badge: getVal('Badge') || ''
            };
        });

        // Filtrar productos válidos
        const validProducts = products.filter(p => p.name && p.name !== 'Sin nombre');

        return res.status(200).json({
            success: true,
            count: validProducts.length,
            products: validProducts,
            lastSync: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error en sync-products:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Error al sincronizar productos'
        });
    }
}

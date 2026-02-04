/**
 * Configuration du WebSIG
 */

const CONFIG = {
  // === CARTE ===
  map: {
    center: [6.914056, -5.229250], // Yamoussoukro
    zoom: 12,
    minZoom: 10,
    maxZoom: 18
  },

  // === FONDS DE CARTE ===
  basemaps: {
    osm: {
      name: 'OpenStreetMap',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors'
    },
    satellite: {
      name: 'Satellite (Esri)',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '&copy; Esri'
    }
  },

  // === COUCHES ADDITIONNELLES (OVERLAYS) ===
  overlayLayers: {
    orthophoto: {
      name: 'Ortho-Photo',
      url: 'https://efdxgfjxblbdqqrieymn.supabase.co/storage/v1/object/public/Ortho/14-19.mbtiles',
      type: 'mbtiles',
      attribution: 'Ortho-Photo',
      visible: true
    }
  },

  // === COUCHES DE DONNÉES ===
  dataLayers: {
    lots: {
      name: 'Lots',
      url: './data/processed/lots.geojson',
      style: {
        color: '#3388ff',
        weight: 2,
        fillOpacity: 0.3,
        fillColor: '#3388ff'
      },
      visible: true,
      attribution: 'nom_lot'
    },
    ilots: {
      name: 'Îlots',
      url: './data/processed/ilots.geojson',
      style: {
        color: '#ff7800',
        weight: 2,
        fillOpacity: 0.2,
        fillColor: '#ff7800'
      },
      visible: true,
      attribution: 'nom_ilot'
    },
    polygonale: {
      name: 'Polygonale',
      url: './data/processed/polygonale.geojson',
      style: {
        color: '#00ff00',
        weight: 3,
        fillOpacity: 0.1,
        fillColor: '#00ff00'
      },
      visible: false,
      attribution: 'reference'
    },
    Lot_V: {
      name: 'Lotissement Voisin',
      url: './data/processed/LOTISSEMENT_APPROUVE.geojson',
      style: {
        color: '#959595ff',
        weight: 3,
        fillOpacity: 0.02,
        fillColor: '#959595ff'
      },
      visible: true,
      attribution: 'Support'
    }
  },

  // === POPUP ===
  popup: {
    maxWidth: 300,
    className: 'custom-popup'
  },

  // === GESTION DU CACHE ===
  cacheBuster: true
};
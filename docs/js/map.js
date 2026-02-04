/**
 * Logique principale du WebSIG Leaflet
 * Chargement des données, interactions, filtres
 */

// === VARIABLES GLOBALES ===
let map;
let loadedLayers = {};
let layerControls;

// === INITIALISATION DE LA CARTE ===
function initMap() {
  // Créer la carte
  map = L.map('map', {
    center: CONFIG.map.center,
    zoom: CONFIG.map.zoom,
    minZoom: CONFIG.map.minZoom,
    maxZoom: CONFIG.map.maxZoom,
    zoomControl: true
  });

  // Ajouter les fonds de carte
  const basemaps = {};
  for (const [key, config] of Object.entries(CONFIG.basemaps)) {
    basemaps[config.name] = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: 19
    });
  }

  // Ajouter le premier fond par défaut
  basemaps[CONFIG.basemaps.osm.name].addTo(map);

  // Contrôle des couches
  layerControls = L.control.layers(basemaps, null, {
    collapsed: false,
    position: 'topright'
  }).addTo(map);

  // Charger les overlays additionnels (ortho-photo, etc.)
  if (CONFIG.overlayLayers) {
    for (const [layerId, layerConfig] of Object.entries(CONFIG.overlayLayers)) {
      if (layerConfig.type === 'mbtiles') {
        loadMBTilesLayer(layerId, layerConfig);
      }
    }
  }

  // Échelle
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

  console.log('✅ Carte initialisée');
}

// === FONCTION DE GÉNÉRATION DES POPUPS ===
function createPopupContent(properties, layerName) {
  let html = '<div class="popup-content">';
  html += '<h3>' + layerName + '</h3>';
  html += '<table>';

  // Afficher tous les attributs sauf ceux commençant par '_'
  for (const [key, value] of Object.entries(properties)) {
    if (!key.startsWith('_') && value !== null && value !== '') {
      // Formater les clés (remplacer _ par espaces, capitaliser)
      const label = key.replace(/_/g, ' ')
                       .replace(/\b\w/g, l => l.toUpperCase());
      
      // Formater les valeurs selon le type
      let displayValue = value;
      if (typeof value === 'number') {
        displayValue = value.toLocaleString('fr-FR');
      }
      
      html += '<tr><td><strong>' + label + ':</strong></td><td>' + displayValue + '</td></tr>';
    }
  }

  html += '</table></div>';
  return html;
}

// === FONCTION DE STYLE INTERACTIF ===
function onEachFeature(feature, layer, layerConfig) {
  // Popup
  if (feature.properties) {
    const popupContent = createPopupContent(feature.properties, layerConfig.name);
    layer.bindPopup(popupContent, CONFIG.popup);
  }

  // Survol
  layer.on({
    mouseover: function(e) {
      const layer = e.target;
      layer.setStyle({
        weight: 4,
        fillOpacity: 0.7
      });
      layer.bringToFront();
    },
    mouseout: function(e) {
      const layer = e.target;
      layer.setStyle(layerConfig.style);
    },
    click: function(e) {
      map.fitBounds(e.target.getBounds());
    }
  });
}

// === CHARGEMENT D'UNE COUCHE MBTILES ===
function loadMBTilesLayer(layerId, layerConfig) {
  console.log('📥 Chargement de ' + layerConfig.name + ' (MBTiles)...');

  // Fetch le fichier MBTiles
  fetch(layerConfig.url)
    .then(response => {
      if (!response.ok) {
        throw new Error('HTTP error! status: ' + response.status);
      }
      return response.arrayBuffer();
    })
    .then(async arrayBuffer => {
      // Initialiser sql.js en indiquant où charger le fichier .wasm (CDN)
      const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
      });

      // Ouvrir la base de données MBTiles
      const db = new SQL.Database(new Uint8Array(arrayBuffer));
      
      // Récupérer les métadonnées
      const metadata = {};
      const metaQuery = db.exec('SELECT name, value FROM metadata');
      if (metaQuery.length > 0) {
        for (let i = 0; i < metaQuery[0].values.length; i++) {
          const [name, value] = metaQuery[0].values[i];
          metadata[name] = value;
        }
      }

      console.log('📋 Métadonnées MBTiles:', metadata);

      // Créer une couche TileLayer compatible Leaflet 1.x qui lit les tuiles depuis la BD
      const MBTilesLayer = L.TileLayer.extend({
        getTileUrl: function(coords) {
          const z = coords.z;
          const x = coords.x;
          // Conversion TMS Y (MBTiles utilise TMS, Leaflet utilise XYZ)
          const tmsY = Math.pow(2, z) - coords.y - 1;

          try {
            const result = db.exec(
              `SELECT tile_data FROM tiles WHERE zoom_level = ${z} AND tile_column = ${x} AND tile_row = ${tmsY}`
            );

            if (result.length > 0 && result[0].values.length > 0) {
              const tileData = result[0].values[0][0];
              const blob = new Blob([tileData], { type: 'image/png' });
              return URL.createObjectURL(blob);
            }
          } catch (e) {
            console.error(`Erreur lecture tuile ${z}/${x}/${tmsY}:`, e);
          }

          return '';
        }
      });

      // Créer et configurer la couche
      const tileLayer = new MBTilesLayer({
        minZoom: parseInt(metadata.minzoom) || 14,
        maxZoom: parseInt(metadata.maxzoom) || 19,
        attribution: layerConfig.attribution
      });

      // Stocker la couche
      loadedLayers[layerId] = tileLayer;

      // Ajouter à la carte si visible par défaut
      if (layerConfig.visible) {
        tileLayer.addTo(map);
      }

      // Ajouter au contrôle des couches
      layerControls.addOverlay(tileLayer, layerConfig.name);

      console.log('✅ ' + layerConfig.name + ' chargé');
    })
    .catch(error => {
      console.error('❌ Erreur de chargement de ' + layerConfig.name + ':', error);
      alert('Impossible de charger la couche ' + layerConfig.name);
    });
}

// === CHARGEMENT D'UNE COUCHE GEOJSON ===
function loadGeoJSONLayer(layerId, layerConfig) {
  console.log('📥 Chargement de ' + layerConfig.name + '...');

  // Ajouter cache buster si activé
  let url = layerConfig.url;
  if (CONFIG.cacheBuster) {
    const timestamp = new Date().getTime();
    url += '?v=' + timestamp;
  }

  fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error('HTTP error! status: ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      // Créer la couche Leaflet
      const geojsonLayer = L.geoJSON(data, {
        style: layerConfig.style,
        onEachFeature: function(feature, layer) {
          onEachFeature(feature, layer, layerConfig);
        }
      });

      // Stocker la couche
      loadedLayers[layerId] = geojsonLayer;

      // Ajouter à la carte si visible par défaut
      if (layerConfig.visible) {
        geojsonLayer.addTo(map);
      }

      // Ajouter au contrôle des couches
      layerControls.addOverlay(geojsonLayer, layerConfig.name);

      console.log('✅ ' + layerConfig.name + ' chargé (' + data.features.length + ' entités)');

      // Zoomer sur l'étendue si c'est la première couche
      if (Object.keys(loadedLayers).length === 1) {
        map.fitBounds(geojsonLayer.getBounds());
      }
    })
    .catch(error => {
      console.error('❌ Erreur de chargement de ' + layerConfig.name + ':', error);
      alert('Impossible de charger la couche ' + layerConfig.name);
    });
}

// === CHARGEMENT DE TOUTES LES COUCHES ===
function loadAllLayers() {
  for (const [layerId, layerConfig] of Object.entries(CONFIG.dataLayers)) {
    loadGeoJSONLayer(layerId, layerConfig);
  }
}

// === FONCTION DE FILTRAGE ===
function filterLayer(layerId, attributeName, filterValue) {
  const layer = loadedLayers[layerId];
  if (!layer) return;

  layer.eachLayer(function(sublayer) {
    const value = sublayer.feature.properties[attributeName];
    
    if (filterValue === '' || value == filterValue) {
      sublayer.setStyle({ opacity: 1, fillOpacity: 0.3 });
    } else {
      sublayer.setStyle({ opacity: 0.1, fillOpacity: 0.05 });
    }
  });
}

// === RECHERCHE PAR NUMÉRO DE LOT ===
function searchByLotNumber(searchTerm) {
  // Nettoyer le terme de recherche
  searchTerm = searchTerm.trim();
  
  if (searchTerm === '') {
    alert('Veuillez entrer un numéro de lot');
    return;
  }

  let found = false;
  let foundLayer = null;

  // Parcourir toutes les couches chargées
  for (const [layerId, layer] of Object.entries(loadedLayers)) {
    if (found) break; // Arrêter dès qu'on trouve

    // Ignorer les couches qui ne gèrent pas eachLayer (ex: TileLayer/MBTiles)
    if (!layer || typeof layer.eachLayer !== 'function') {
      continue;
    }

    layer.eachLayer(function(sublayer) {
      // Vérifier si la propriété NUM_LOTS existe
      if (sublayer.feature.properties.NUM_LOTS !== undefined) {
        const numLot = String(sublayer.feature.properties.NUM_LOTS).trim();
        
        // Comparaison exacte ou partielle
        if (numLot === searchTerm || numLot.includes(searchTerm)) {
          // Réinitialiser les autres couches
          resetAllStyles();
          
          // Mettre en surbrillance
          sublayer.setStyle({ 
            color: '#FF0000', 
            weight: 4,
            fillOpacity: 0.7,
            fillColor: '#FF0000'
          });
          
          // Zoomer et ouvrir popup
          if (!found) {
            map.fitBounds(sublayer.getBounds(), { padding: [50, 50] });
            sublayer.openPopup();
            found = true;
            foundLayer = sublayer;
          }
        }
      }
    });
    
    if (found) break; // Arrêter dès qu'on trouve
  }

  if (!found) {
    alert('Aucun lot trouvé avec le numéro : ' + searchTerm);
    resetAllStyles(); // Réinitialiser en cas d'échec
  }
  
  return foundLayer;
}

// === FONCTION POUR RÉINITIALISER TOUS LES STYLES ===
function resetAllStyles() {
  for (const [layerId, layer] of Object.entries(loadedLayers)) {
    // Vérifier que la couche expose eachLayer (GeoJSON/FeatureGroup).
    // Les TileLayer (ex: MBTiles, OSM) n'ont pas eachLayer et doivent être ignorés.
    if (layer && typeof layer.eachLayer === 'function') {
      layer.eachLayer(function(sublayer) {
        sublayer.setStyle(CONFIG.dataLayers[layerId].style);
      });
    }
    // Sinon : on ignore la couche (tile layers, etc.)
  }
}

// === RECHERCHE AVANCÉE (optionnelle) ===
function searchWithAutocomplete(searchTerm) {
  const suggestions = [];
  
  // Collecter tous les numéros de lots
  for (const [layerId, layer] of Object.entries(loadedLayers)) {
    layer.eachLayer(function(sublayer) {
      if (sublayer.feature.properties.NUM_LOTS !== undefined) {
        const numLot = String(sublayer.feature.properties.NUM_LOTS).trim();
        if (numLot.includes(searchTerm)) {
          suggestions.push(numLot);
        }
      }
    });
  }
  
  return suggestions;
}

// === EXPORT DES DONNÉES VISIBLES ===
function exportVisibleData(layerId, format) {
  format = format || 'geojson';
  const layer = loadedLayers[layerId];
  if (!layer) return;

  const features = [];
  layer.eachLayer(function(sublayer) {
    features.push(sublayer.feature);
  });

  const geojson = {
    type: 'FeatureCollection',
    features: features
  };

  // Télécharger
  const dataStr = JSON.stringify(geojson, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = layerId + '_export.geojson';
  link.click();
  URL.revokeObjectURL(url);
}

// === INITIALISATION AU CHARGEMENT DE LA PAGE ===
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Initialisation du WebSIG...');
  initMap();
  loadAllLayers();
});
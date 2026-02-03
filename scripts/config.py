"""
Configuration centralisée du projet
Modifiez ces paramètres selon vos besoins
"""

import os
from pathlib import Path

# === CHEMINS ===
BASE_DIR = Path(__file__).parent.parent
RAW_DATA_DIR = BASE_DIR / "data" / "raw"
PROCESSED_DATA_DIR = BASE_DIR / "data" / "processed"
BACKUP_DIR = BASE_DIR / "backup"
LOG_DIR = BASE_DIR / "logs"

# Créer les dossiers s'ils n'existent pas
for directory in [RAW_DATA_DIR, PROCESSED_DATA_DIR, BACKUP_DIR, LOG_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# === CONFIGURATION DES COUCHES ===
# Définissez ici vos fichiers sources et leurs noms de sortie
LAYERS_CONFIG = {
    "lots": {
        "source_file": "LOTS.gpkg",  # Nom du fichier dans data/raw/
        "output_name": "lots.geojson",
        "description": "Parcelles de lots"
    },
    "ilots": {
        "source_file": "ILOTS.gpkg",
        "output_name": "ilots.geojson",
        "description": "Îlots urbains"
    },
    "polygonale": {
        "source_file": "POLYGONALE_ZONE_ETUDE.gpkg",
        "output_name": "polygonale.geojson",
        "description": "Polygonale cadastrale"
    }
}

# === PARAMÈTRES GÉOMÉTRIQUES ===
TARGET_CRS = "EPSG:4326"  # Projection cible pour Leaflet
SIMPLIFY_TOLERANCE = 0.00001  # Simplification géométrique (en degrés, ~1m)
PRECISION = 6  # Précision décimale des coordonnées

# === PARAMÈTRES DE TRAITEMENT ===
ATTRIBUTES_TO_KEEP = [
    # Liste des champs à conserver (laissez vide pour tout garder)
    # Exemple: ["nom", "proprietaire", "surface", "date_maj"]
]

# === EMAIL NOTIFICATION (optionnel) ===
SEND_EMAIL_ON_ERROR = False  # Mettre True si vous configurez l'email
EMAIL_RECIPIENT = "votre.email@example.com"
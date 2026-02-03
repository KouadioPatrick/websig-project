"""
Script de traitement automatique des données SIG
- Charge les fichiers sources (Shapefile, GeoPackage, etc.)
- Reprojette en WGS84
- Simplifie les géométries (gère Polygon ET MultiPolygon)
- Exporte en GeoJSON optimisé
- Sauvegarde l'ancienne version avant écrasement
"""

import sys
import logging
from datetime import datetime
from pathlib import Path
import shutil
import json

import geopandas as gpd
import pandas as pd
from shapely.geometry import mapping

# Import de la configuration
from config import (
    RAW_DATA_DIR,
    PROCESSED_DATA_DIR,
    BACKUP_DIR,
    LOG_DIR,
    LAYERS_CONFIG,
    TARGET_CRS,
    SIMPLIFY_TOLERANCE,
    PRECISION,
    ATTRIBUTES_TO_KEEP
)


# === CONFIGURATION DU LOGGING ===
def setup_logging():
    """Configure le système de logs"""
    log_file = LOG_DIR / f"process_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    return logging.getLogger(__name__)


# === FONCTION DE SAUVEGARDE ===
def backup_existing_file(output_path):
    """
    Sauvegarde le fichier existant avant écrasement
    Conserve les 3 dernières versions
    """
    if not output_path.exists():
        return
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_name = f"{output_path.stem}_{timestamp}{output_path.suffix}"
    backup_path = BACKUP_DIR / backup_name
    
    shutil.copy2(output_path, backup_path)
    logger.info(f"✅ Sauvegarde créée: {backup_path.name}")
    
    # Nettoyage: garde seulement les 3 dernières sauvegardes
    backups = sorted(BACKUP_DIR.glob(f"{output_path.stem}_*{output_path.suffix}"))
    for old_backup in backups[:-3]:
        old_backup.unlink()
        logger.info(f"🗑️  Ancienne sauvegarde supprimée: {old_backup.name}")


# === FONCTION DE VALIDATION GÉOMÉTRIQUE ===
def validate_and_fix_geometries(gdf):
    """
    Vérifie et corrige les géométries invalides
    """
    invalid_count = (~gdf.is_valid).sum()
    
    if invalid_count > 0:
        logger.warning(f"⚠️  {invalid_count} géométries invalides détectées")
        gdf['geometry'] = gdf['geometry'].buffer(0)  # Fix classique
        logger.info(f"✅ Géométries corrigées")
    
    return gdf


# === FONCTION DE NETTOYAGE DES ATTRIBUTS ===
def clean_attributes(gdf):
    """
    Nettoie et filtre les attributs
    """
    # Supprimer les colonnes qui ne servent à rien
    columns_to_drop = [col for col in gdf.columns if col.startswith('__')]
    if columns_to_drop:
        gdf = gdf.drop(columns=columns_to_drop)
    
    # Filtrer selon ATTRIBUTES_TO_KEEP si défini
    if ATTRIBUTES_TO_KEEP:
        cols_to_keep = ['geometry'] + [col for col in ATTRIBUTES_TO_KEEP if col in gdf.columns]
        gdf = gdf[cols_to_keep]
    
    # Convertir les dates en chaînes pour compatibilité JSON
    for col in gdf.columns:
        if pd.api.types.is_datetime64_any_dtype(gdf[col]):
            gdf[col] = gdf[col].dt.strftime('%Y-%m-%d')
    
    # Remplacer les valeurs NaN par None
    gdf = gdf.where(pd.notnull(gdf), None)
    
    return gdf


# === FONCTION DE COMPTAGE DES VERTICES ===
def count_vertices(geom):
    """
    Compte le nombre de vertices d'une géométrie
    Gère Polygon, MultiPolygon, LineString, MultiLineString
    """
    if geom is None:
        return 0
    
    geom_type = geom.geom_type
    
    if geom_type == 'Polygon':
        # Un seul polygone
        return len(geom.exterior.coords)
    
    elif geom_type == 'MultiPolygon':
        # Plusieurs polygones
        return sum(len(poly.exterior.coords) for poly in geom.geoms)
    
    elif geom_type == 'LineString':
        # Une ligne
        return len(geom.coords)
    
    elif geom_type == 'MultiLineString':
        # Plusieurs lignes
        return sum(len(line.coords) for line in geom.geoms)
    
    elif geom_type == 'Point':
        # Un point = 1 vertex
        return 1
    
    elif geom_type == 'MultiPoint':
        # Plusieurs points
        return len(geom.geoms)
    
    else:
        # Type inconnu
        return 0


# === FONCTION PRINCIPALE DE TRAITEMENT ===
def process_layer(layer_name, layer_config):
    """
    Traite une couche SIG complète
    """
    logger.info(f"\n{'='*60}")
    logger.info(f"🗺️  Traitement de la couche: {layer_name}")
    logger.info(f"{'='*60}")
    
    source_path = RAW_DATA_DIR / layer_config['source_file']
    output_path = PROCESSED_DATA_DIR / layer_config['output_name']
    
    # === 1. VÉRIFICATION FICHIER SOURCE ===
    if not source_path.exists():
        logger.error(f"❌ Fichier source introuvable: {source_path}")
        return False
    
    logger.info(f"📂 Fichier source: {source_path.name}")
    
    try:
        # === 2. SAUVEGARDE DE L'ANCIENNE VERSION ===
        backup_existing_file(output_path)
        
        # === 3. CHARGEMENT DES DONNÉES ===
        logger.info("📥 Chargement des données...")
        gdf = gpd.read_file(source_path)
        logger.info(f"✅ {len(gdf)} entités chargées")
        logger.info(f"📐 Projection source: {gdf.crs}")
        
        # === 4. VALIDATION GÉOMÉTRIQUE ===
        logger.info("🔍 Validation des géométries...")
        gdf = validate_and_fix_geometries(gdf)
        
        # === 5. REPROJECTION ===
        if gdf.crs != TARGET_CRS:
            logger.info(f"🔄 Reprojection vers {TARGET_CRS}...")
            gdf = gdf.to_crs(TARGET_CRS)
            logger.info("✅ Reprojection terminée")
        
        # === 6. SIMPLIFICATION GÉOMÉTRIQUE ===
        logger.info(f"✂️  Simplification (tolérance: {SIMPLIFY_TOLERANCE})...")
        
        # Compter avant simplification
        original_vertices = gdf.geometry.apply(count_vertices).sum()
        
        # Simplification
        gdf['geometry'] = gdf.geometry.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
        
        # Compter après simplification
        simplified_vertices = gdf.geometry.apply(count_vertices).sum()
        
        # Calculer la réduction
        if original_vertices > 0:
            reduction = 100 * (1 - simplified_vertices / original_vertices)
            logger.info(f"✅ Réduction de {reduction:.1f}% des vertices ({original_vertices} → {simplified_vertices})")
        else:
            logger.info(f"✅ Simplification terminée")
        
        # === 7. NETTOYAGE DES ATTRIBUTS ===
        logger.info("🧹 Nettoyage des attributs...")
        gdf = clean_attributes(gdf)
        logger.info(f"✅ {len(gdf.columns)-1} attributs conservés")
        
        # === 8. EXPORT GEOJSON OPTIMISÉ ===
        logger.info("💾 Export GeoJSON...")
        gdf.to_file(
            output_path,
            driver='GeoJSON',
            encoding='utf-8'
        )
        
        # === 9. OPTIMISATION FINALE (réduction précision) ===
        with open(output_path, 'r', encoding='utf-8') as f:
            geojson_data = json.load(f)
        
        # Arrondir les coordonnées pour réduire la taille
        def round_coords(coords):
            if isinstance(coords[0], list):
                return [round_coords(c) for c in coords]
            return [round(c, PRECISION) for c in coords]
        
        for feature in geojson_data['features']:
            geom = feature['geometry']
            geom['coordinates'] = round_coords(geom['coordinates'])
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(geojson_data, f, ensure_ascii=False, separators=(',', ':'))
        
        # === 10. STATISTIQUES FINALES ===
        file_size = output_path.stat().st_size / 1024  # en Ko
        logger.info(f"✅ Export terminé: {output_path.name}")
        logger.info(f"📊 Taille finale: {file_size:.2f} Ko")
        logger.info(f"✅ {layer_name} traité avec succès!")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur lors du traitement de {layer_name}: {str(e)}", exc_info=True)
        return False


# === FONCTION PRINCIPALE ===
def main():
    """
    Point d'entrée du script
    """
    global logger
    logger = setup_logging()
    
    logger.info("="*80)
    logger.info("🚀 DÉMARRAGE DU TRAITEMENT DES DONNÉES SIG")
    logger.info("="*80)
    logger.info(f"📅 Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    success_count = 0
    total_count = len(LAYERS_CONFIG)
    
    # Traiter chaque couche
    for layer_name, layer_config in LAYERS_CONFIG.items():
        if process_layer(layer_name, layer_config):
            success_count += 1
    
    # === RAPPORT FINAL ===
    logger.info("\n" + "="*80)
    logger.info("📊 RAPPORT FINAL")
    logger.info("="*80)
    logger.info(f"✅ Couches traitées avec succès: {success_count}/{total_count}")
    
    if success_count == total_count:
        logger.info("🎉 Tous les traitements ont réussi!")
        return 0
    else:
        logger.error(f"❌ {total_count - success_count} couche(s) en échec")
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
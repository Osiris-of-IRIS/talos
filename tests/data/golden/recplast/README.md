# Recplast Example Organization - New Asset Structure

This directory contains asset data for the example organization "Recplast" migrated from old IT-Grundschutz format to the new Grundschutz++ OSCAL tool format.

## File Overview

### New Format Files (for import into OSCAL tool)

1. **asset_types.csv** - Defines 23 asset type categories
   - Columns: `uuid`, `title`
   - Examples: `client-pc`, `laptop`, `server`, `application-office`, etc.

2. **assets.csv** - Contains 94 individual assets from Recplast organization
   - Columns: `uuid`, `name`, `asset_type`, `description`, `security-sensitivity-level`, `information-types`
   - Includes:
     - 18 Desktop PCs (C001-C009, organized by department)
     - 18 Laptops (L001-L009, organized by department)
     - 15 Servers (S001-S015)
     - 32 Applications (A001-A032)
     - 8 Network components (N001-N008)
     - 2 Telecom components (T001-T002)
     - 2 Buildings (GB001-GB002)
     - 11 Rooms (R001-R019)
     - 6 Service providers (D001-D006)

3. **mappings.csv** - Maps asset types to Zielobjekt classes from zielobjekte.csv
   - Columns: `asset_type_uuid`, `targetobj_class_uuid`
   - 23 mappings connecting asset types to target object hierarchy

4. **zielobjektkategorien.csv** - Grundschutz++ target object hierarchy (44 entries)
   - This is the authoritative source for target object classifications
   - Includes hierarchy via `ChildOfUUID` field

### Old IT-Grundschutz Format Files (legacy, for reference)

- **anwendungen.csv** - Applications (A001-A032)
- **dienstleister.csv** - Service providers (6 companies)
- **gebaeude_und_raeume.csv** - Buildings and rooms (GB001-GB002, R001-R019)
- **geschaeftsprozesse.csv** - Business processes (GP001-GP011)
- **ics_systeme.csv** - ICS systems (empty in this example)
- **iot_systeme.csv** - IoT systems (empty in this example)
- **itsysteme.csv** - IT systems (C001-C009, L001-L009, S001-S015)
- **kommunikationsverbindungen.csv** - Communication connections (empty in this example)
- **netz_und_telekomkomponenten.csv** - Network and telecom (N001-N008, T001-T002)

## Asset Type to Zielobjekt Mapping

| Asset Type | Target Object (Zielobjekt) | UUID |
|------------|---------------------------|------|
| client-pc, laptop | Endgeräte (End User Devices) | 837781a4-7b47-4695-9545-a3310eac7a66 |
| server | Hostsysteme (Host Systems) | 19c946fc-e991-44ee-87c5-7bbe5d5aaf55 |
| application-office | Office-Anwendungen | b5f9e5ce-d90e-4da5-8ee7-32eae4829e55 |
| application-server, application-database, application-business | Anwendungen (Applications) | 7e41ecf5-1831-4691-ad0c-4fc7bbc1b871 |
| application-web | Webanwendungen (Web Applications) | 36cb0d6b-2f90-43bc-b625-9870112cf847 |
| application-virtualization | Virtualisierungslösungen | 38167a3c-ee3e-4261-9c44-994c15a31d2c |
| network-router | Externe Netzanschlüsse (External Network Connections) | a9521914-ccf9-4c20-8eef-2dd912fb815d |
| network-switch, network-firewall, network-recobs | Interne Netzsegmente (Internal Network Segments) | 8ef347e7-ea3f-4624-b0f3-2af728443301 |
| network-wlan-ap | WLANs | 82a399a2-2fa7-4dd2-9850-89a7ee0505ea |
| telecom-phone-system | TK-Anwendungen (Telecom Applications) | 67f74abf-162d-4e47-a24a-6ff53e9b124d |
| telecom-fax | Faxe (Fax Machines) | 05df1662-903f-41ff-ba88-0fbe86050550 |
| building | Gebäude (Buildings) | 422401b2-2c71-4ea5-a71c-6f386ba16cfc |
| room-office, room-production | Räume (Rooms) | 09517106-2c2c-411e-a06c-65736363286f |
| room-server | Serverräume (Server Rooms) | 3a894eaa-7b42-4f59-9961-76c9a3ec2837 |
| room-technical | Räume für technische Infrastruktur | 564530dd-29ce-4988-9192-3b4dbfef061c |
| room-archive | Datenträgerarchiv (Media Archive) | dfd8e05b-a028-4403-9776-255b968cc4a6 |
| service-provider | Dienstleistungen (Services) | 04d5e0fa-7b1a-48d5-b87c-1ee0060a4c2d |

## Security Sensitivity Levels

Assets are classified into three security sensitivity levels:

- **normal** (45 assets) - Standard business assets with normal protection requirements
- **erhöht** (36 assets) - Elevated protection requirements (development, production control, network infrastructure)
- **hoch** (22 assets) - High protection requirements (strategic data, financial data, personnel data, critical infrastructure)

## Import Instructions

To import these assets into the OSCAL tool:

### Method 1: Using CLI

```bash
# 1. Load target object hierarchy
python3 iris.py namespaces load tests/data/example-recplast/zielobjekte.csv

# 2. Import asset types (requires implementation of asset type import)
# Currently, asset types need to be loaded manually or via SQL

# 3. Import assets
python3 iris.py assets import tests/data/example-recplast/assets.csv

# 4. Import mappings (requires implementation of mapping import)
# Currently, mappings need to be created via API or manually
```

### Method 2: Using API

```bash
# Start the API server
python3 iris.py serve

# Then use HTTP calls:
# POST /namespaces/load (for zielobjekte.csv)
# POST /assets/import (for assets.csv)
# POST /mappings (for each mapping in mappings.csv)
```

### Method 3: Using Web UI

1. Start the server: `python3 iris.py serve`
2. Navigate to http://localhost:8080/ui/
3. Use the import features for assets and mappings

## Data Quality Notes

- All 103 assets have been assigned appropriate security sensitivity levels based on their function
- Information types have been documented for technical assets
- Asset descriptions provide context for each asset's purpose and location
- Original Kuerzel (short codes) from old format are preserved as UUIDs for traceability

## Migration Details

**From:** Old IT-Grundschutz separate category CSVs (9 files)
**To:** New unified schema with 3 files (asset_types, assets, mappings)

**Key Changes:**
1. Consolidated all asset categories into single `assets.csv`
2. Created explicit asset type taxonomy (23 types)
3. Mapped asset types to new Grundschutz++ Zielobjekt hierarchy
4. Added security sensitivity levels and information type classifications
5. Enhanced descriptions for better context

**Total Assets Migrated:** 94
- IT Systems: 51 (Desktop PCs, Laptops, Servers)
- Applications: 32
- Network/Telecom: 10
- Buildings/Rooms: 13
- Service Providers: 6
- Business Processes: Not migrated (GP001-GP011) - these are organizational processes, not technical assets

## Related Files

- **Beschreibung_Recplast.txt** - Detailed description of the Recplast organization (German)

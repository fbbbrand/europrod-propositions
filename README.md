# Générateur de propositions Europrod

Application web qui transforme les exports JSON du carnet de visite GTB en propositions commerciales PowerPoint aux couleurs d’Europrod Technologies.

Le traitement est réalisé dans le navigateur : les données de visite et le PowerPoint généré ne sont pas envoyés à un serveur applicatif.

## Utilisation par les équipes

1. Ouvrir l’adresse partagée du générateur.
2. Exporter le relevé depuis `Fiche_Visite_GTB_1.html` au format JSON.
3. Déposer le fichier dans l’interface.
4. Vérifier le client, le site, le prix, la récurrence et la classe de performance.
5. Cliquer sur **Générer le PowerPoint**.
6. Relire les hypothèses et les engagements réglementaires avant l’envoi au client.

Le fichier `.pptx` est généré et téléchargé directement sur le poste de l’utilisateur. Le gabarit source n’est jamais modifié.

## Démarrage local pour le développement

Depuis PowerShell, dans ce dossier :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

Ouvrir ensuite `http://127.0.0.1:4173`.

Le serveur local conserve également l’ancienne route de génération utilisée pour les tests. La version publiée utilise uniquement les fichiers statiques de `public/` et génère le PowerPoint côté navigateur.

## Démonstration

L'interface contient un bouton **Charger l'exemple**. Le jeu de données est fictif.

Pour générer directement le PowerPoint de démonstration :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Demo
```

La présentation de démonstration est écrite dans `output/Propale_Europrod_Demo.pptx`.

## Construction de la version partageable

```powershell
npm run build
```

Le dossier `dist/` obtenu contient l’application web autonome à publier.

## Périmètre de cette version

- import du JSON actuel du carnet GTB ;
- contrôle des informations essentielles ;
- synthèse du périmètre, des protocoles, du comptage et des points terrain ;
- adaptation des diapositives 1 à 10 du gabarit Europrod ;
- prix, récurrence et classe réglementaire soumis à validation humaine ;
- sortie PowerPoint éditable.

Les photos sont comptées dans le contrôle mais ne sont pas insérées dans la présentation commerciale de cette première version.

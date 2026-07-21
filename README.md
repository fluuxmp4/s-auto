# S AUTO — Site + panel gérant

Carrosserie S AUTO (Saint-Genis-Laval) : site vitrine, devis, espace admin.

## Lancer en local

```powershell
cd "C:\Users\enzol\Projects\S AUTO"
npm install
npm run dev
```

- Site : http://127.0.0.1:5173/
- Admin : http://127.0.0.1:5173/admin  
- Identifiants : `gerant` / `Sauto2026!` (modifiable dans `.env`)

## Déployer sur Render (accès public)

### 1. Mettre le code sur GitHub

```powershell
cd "C:\Users\enzol\Projects\S AUTO"
git init
git add .
git commit -m "Site S AUTO prêt pour Render"
```

Crée un dépôt sur GitHub, puis :

```powershell
git remote add origin https://github.com/TON_COMPTE/s-auto.git
git branch -M main
git push -u origin main
```

### 2. Créer le service sur Render

1. Va sur [https://dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**
2. Connecte le dépôt GitHub `s-auto`
3. Réglages :
   - **Runtime** : Node
   - **Build Command** : `npm install && npm run build`
   - **Start Command** : `npm start`
   - **Instance** : Free
4. **Environment** (Variables) :
   - `MANAGER_USER` = `gerant`
   - `MANAGER_PASSWORD` = *(choisis un mot de passe fort)*
   - `JWT_SECRET` = *(chaîne longue aléatoire)*
   - `NODE_VERSION` = `22.12.0`
5. Clique **Create Web Service**

### 3. Accéder au site

Render donne une URL du type :

`https://s-auto-xxxx.onrender.com`

- Site : cette URL  
- Panel : `https://s-auto-xxxx.onrender.com/admin`

Sur le plan gratuit, le service peut s’endormir après inactivité (~1 min au réveil).

**Note** : les photos / devis sont stockés sur le disque de l’instance. Sur le free, un redéploiement peut les effacer. Pour les garder longtemps, ajoute un **Persistent Disk** payant sur Render (chemins `DATA_DIR` / `UPLOAD_DIR`).

## Infos garage

- 14 Chem. de Chapoly-Laval, 69230 Saint-Genis-Laval  
- 09 88 08 18 53  

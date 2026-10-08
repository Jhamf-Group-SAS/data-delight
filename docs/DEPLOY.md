# Guía de despliegue: data-delight (Regency)

Versión Regency de `GUIA_DESPLIEGUE_IMAGENES_PORTAINER.md`. Las imágenes se construyen en GitHub Actions y se publican en GHCR; el servidor nunca compila ni instala nada al arrancar.

## 1. Flujo

```
push a `main`
   -> GitHub Actions construye backend y frontend y los publica en GHCR (prod-latest + prod-<sha>)
   -> GitHub Actions reescribe las líneas image: de docker-stack.yml y commitea ([skip ci])
   -> GitHub Actions hace POST al webhook de Portainer
   -> Portainer redespliega el stack `data-delight` con las imágenes nuevas
```

## 2. Ramas

| Rama | Qué hace |
|---|---|
| `dev` | Solo CI (`ci.yml`): tests, tsc, chequeo de sintaxis, build de las imágenes sin publicar. No despliega. |
| `main` | Producción. Cada push dispara `deploy-production.yml`. |

Los pull requests (a cualquier rama) también corren `ci.yml`. Todavía no existe un ambiente dev de Regency, por eso `dev` no despliega.

## 3. Imágenes y tags

- `ghcr.io/jhamf-group-sas/data-delight-backend`
- `ghcr.io/jhamf-group-sas/data-delight-frontend`

Tags: `prod-latest` (mutable) y `prod-<sha7>` (inmutable, por commit). `docker-stack.yml` siempre apunta al tag inmutable tras un deploy. El frontend recibe `VITE_API_URL` en build (por defecto `https://registros.regency.jhamf.com`; se puede sobrescribir con la variable de repositorio `VITE_API_URL`).

## 4. Stack y variables de entorno

Archivo: `docker-stack.yml` (stack `data-delight`, red externa `jhamfstack`). No contiene secretos: todo valor sensible es `${VAR}` y se define como variable de entorno del stack en Portainer.

| Variable | Obligatoria | Por defecto |
|---|---|---|
| `DB_USER` | sí | - |
| `DB_PASSWORD` | sí | - |
| `JWT_SECRET` | sí | - |
| `DB_HOST` | no | `mysql` |
| `DB_PORT` | no | `3306` |
| `DB_NAME` | no | `registros_regency` |
| `PROTECTED_USERNAMES` | no | vacío |

## 5. Configuración única

### a) Secreto en GitHub
Crear el secreto de repositorio `PORTAINER_WEBHOOK_URL_PROD` (Settings > Secrets and variables > Actions) con la URL del webhook del paso b). Si falta, el workflow falla de forma explícita (en el pasado un secreto mal nombrado falló en silencio).

### b) Stack en Portainer
1. Eliminar el stack actual `data-delight` (el nombre debe ser el mismo). Recrearlo causa una caída breve.
2. Crear un stack tipo **Repository**: URL `https://github.com/Jhamf-Group-SAS/data-delight`, referencia `refs/heads/main`, ruta de compose `docker-stack.yml`. Si el repo es privado, activar autenticación con un PAT de GitHub de solo lectura.
3. Activar **GitOps updates** con el mecanismo **Webhook** y copiar la URL generada al secreto de GitHub (paso a).
4. Definir las variables de entorno del stack (sección 4).

### c) Acceso a GHCR
Los paquetes son privados por defecto. Opciones: hacerlos visibles para la organización o públicos, o agregar el registro `ghcr.io` en Portainer (Registries) con un PAT con permiso `read:packages`.

## 6. Promoción dev -> main

Es una decisión humana, vía PR o merge. El único conflicto esperado son las líneas `image:` de `docker-stack.yml`: se resuelven conservando las de `main`.

## 7. Verificar un deploy

- Actions: el workflow `Deploy production` debe terminar en verde (incluye el POST al webhook).
- Portainer: Stacks > `data-delight`, o Services, y revisar que la imagen sea `prod-<sha>` y las tareas estén `running`.
- En el manager: `docker service ls`, `docker service ps data-delight_backend` y `docker service ps data-delight_frontend`; para el digest, `docker service inspect data-delight_backend --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'`.

## 8. Rollback

- Por Portainer (más rápido, sin rebuild): Services > servicio > Rollback, o `docker service rollback data-delight_backend`. Alternativa: editar el stack en Portainer y fijar el `image:` a un `prod-<sha>` anterior.
- Por Git: hacer `git revert` del commit problemático en `main` y push; el flujo reconstruye y despliega. Nota: cualquier push a `main` reescribe las líneas `image:` al `prod-<sha>` nuevo, así que editar solo `docker-stack.yml` a mano no sirve como rollback por Git.

## 9. Riesgos conocidos

- Con `update_config.order: stop-first` hay una ventana de caída de segundos en cada deploy (se detiene la tarea vieja antes de arrancar la nueva). Pasar a `start-first` exigiría más recursos.
- Nunca se compila ni se instala al arrancar: el 2026-10-08 reiniciar ambos servicios con `git clone && npm install` sobrecargó la VM (4 CPU, 16 GB, sin swap, disco al 90%), cayó el raft de Swarm y se reiniciaron todos los contenedores del host.

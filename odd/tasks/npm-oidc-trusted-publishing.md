# Feature: npm-oidc-trusted-publishing

> **Origen**: Política npm v12 anunciada en
> [GitHub Blog 2026-07-08](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/).
> A partir de **enero 2027**, los tokens de larga duración con bypass-2FA ya no podrán
> publicar directamente. Hoy el repo publica con `secrets.NPM_TOKEN`, lo que rompe en esa fecha.
>
> **Decisión de alcance**: Migrar el CI/CD automatizado a **Trusted Publishing con OIDC**
> (decidido por el usuario). Sin secretos de larga duración en el flujo de release.
> El secret `NPM_TOKEN` queda como contingencia **solo si** la ruta manual lo requiere;
> por defecto se elimina del flujo automatizado.

## Premisas

- `package.json` ya tiene `repository.url` apuntando a `github.com/naml14/axiom-framework`
  (requisito de npm para validar el repo en el flujo OIDC).
- El paquete es público y el repo también → provenance automática con OIDC.
- Bun 1.3.11 soporta OIDC en `bun publish` desde Bun 1.1+, por lo que podemos mantener
  Bun en el paso de publicación sin introducir el CLI de npm.

## Cambios

### 1. `.github/workflows/release-please.yml` (publicación automática)

- **Job `publish`**:
  - `permissions: contents: read, id-token: write` (este último es el permiso crítico).
  - `oven-sh/setup-bun`: eliminar el bloque `registries:` (ya no se inyecta token).
  - Paso `Publish to npm`: eliminar `env: NPM_TOKEN`.
  - Mantener `bun publish --access public`.

### 2. `.github/workflows/publish.yml` (publicación manual de contingencia)

- Mismos cambios que `release-please.yml` en el job `publish`.
- Permisos: `contents: read` en el workflow (existente) + `id-token: write` en el job.

### 3. Configuración en npmjs.com (acción manual del usuario, una sola vez por workflow)

Para el paquete `axiom-framework` en
[Package settings → Trusted publishing](https://www.npmjs.com/package/axiom-framework/access):

1. **Trusted publisher #1** (release automatizado):
   - Organization/user: `naml14`
   - Repository: `axiom-framework`
   - Workflow filename: `release-please.yml`
   - Allowed actions: `npm publish` (directo)

2. **Trusted publisher #2** (release manual de contingencia):
   - Organization/user: `naml14`
   - Repository: `axiom-framework`
   - Workflow filename: `publish.yml`
   - Allowed actions: `npm publish` (directo)

3. (Opcional, recomendado) **Publishing access**:
   - "Require two-factor authentication and disallow tokens"
   - Esto bloquea cualquier intento de publicar con un token tradicional.

### 4. Limpieza post-verificación

- Una vez que el primer publish automatizado por OIDC confirme el flujo, revocar
  el `NPM_TOKEN` en npm (Settings → Tokens). El secret en GitHub puede quedarse
  unos días por si hay que hacer rollback, pero termina eliminándose.

## Tareas

- [x] T1. Migrar `release-please.yml` a OIDC
- [x] T2. Migrar `publish.yml` a OIDC
- [x] T3. Verificación estática: workflows válidos, sin refs a NPM_TOKEN
- [x] T4. Documentar pasos de npmjs.com (sección 3 de este archivo + comentarios en cada workflow)

## Pendientes del usuario (fuera del repo)

- [ ] **U1.** Añadir en https://npmjs.com/package/axiom-framework/settings/trusted-publishers
      los dos Trusted Publishers descritos arriba (uno por workflow).
- [ ] **U2.** Tras un publish automatizado exitoso, opcionalmente revocar el token
      de larga duración en https://npmjs.com/settings/tokens y eliminar
      `secrets.NPM_TOKEN` del repositorio GitHub.
- [ ] **U3.** (Opcional, recomendado) Marcar Publishing access como
      "Require two-factor authentication and disallow tokens".
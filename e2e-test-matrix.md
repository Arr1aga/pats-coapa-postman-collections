# Matriz de Pruebas E2E — Pats Coapa Backend

Documento de referencia para la cobertura de pruebas E2E ejecutadas con Newman sobre la colección Postman del proyecto. Cubre los servicios `pats-coapa-auth`, `pats-coapa-roster` y `pats-coapa-gateway`.

## Cómo ejecutar

```bash
# Desde el directorio raíz del proyecto
./docs/postman/run-e2e.sh

# Pasar argumentos extra a Newman (ej. filtrar módulo)
./docs/postman/run-e2e.sh --folder "5. Roster"

# Directamente con Newman
npx newman run docs/postman/pats-coapa.e2e.postman_collection.json \
  --environment docs/postman/env-local.json \
  --reporters cli \
  --bail
```

El script limpia la base de datos (auth_db + roster_db), Redis y vuelve a aplicar migraciones + seeds antes de correr Newman. Los servicios deben estar levantados antes de ejecutar. Ver sección **Servicios requeridos** al final del documento.

---

## Resumen de cobertura

| Módulo | Nombre | Requests | Happy paths | Error cases |
|--------|--------|----------|-------------|-------------|
| 1 | Setup | 2 | 2 | 0 |
| 2 | Auth: Flujos Base | 4 | 4 | 0 |
| 3 | Auth: Role Guards | 10 | 6 | 4 |
| 4 | Auth: Error Cases | 7 | 0 | 7 |
| 5 | Roster | 5 | 4 | 1 |
| 6 | Gateway | 10 | 7 | 3 |
| 7 | Roles CRUD | 7 | 5 | 2 |
| 8 | Staff: Access Control | 10 | 7 | 3 |
| 9 | Coach: Roster Category Restriction | 7 | 4 | 3 |
| 10 | Tutor: Ownership | 4 | 2 | 2 |
| 11 | Device Tokens | 3 | 2 | 1 |
| 12 | Soft Delete | 3 | 2 | 1 |
| 13 | Gateway: Roster E2E | 6 | 4 | 2 |
| 14 | Staff & Staff-Manager: Roster Access | 8 | 3 | 5 |
| **Total** | | **86** | **52** | **34** |

---

## Módulo 1 — Setup

Inicialización de sesión administrativa. Deben ejecutarse primero; los módulos siguientes dependen de las variables que capturan.

| Request | Método | Endpoint | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|----------|-------|-----------------|------------------|---------------------------|
| Admin Login | `POST` | `/auth/login` | Admin (credenciales de `.env`) | `200` | `accessToken` presente, `refreshToken` presente | `ADMIN_TOKEN`, `ADMIN_REFRESH` |
| Capture Admin User ID | `GET` | `/admin/users` | Admin (`ADMIN_TOKEN`) | `200` | Al menos un usuario con `role` = `admin` | `ADMIN_USER_ID` |

---

## Módulo 2 — Auth: Flujos Base

Cobertura de los endpoints públicos de autenticación y el endpoint `/auth/me`.

| Request | Método | Endpoint | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|----------|-------|-----------------|------------------|---------------------------|
| Register Tutor | `POST` | `/auth/register` | Anónimo | `201` ó `409` | `role` = `parent` | `TUTOR_USER_ID` |
| Login as Tutor | `POST` | `/auth/login` | Tutor | `200` | `accessToken` presente | `TUTOR_TOKEN` |
| GET /auth/me as Admin | `GET` | `/auth/me` | Admin (`ADMIN_TOKEN`) | `200` | `role` = `admin`, `permissions` incluye `*`, `email` presente | — |
| Refresh Token | `POST` | `/auth/refresh` | Admin (`ADMIN_REFRESH`) | `200` | Nuevo `accessToken` y `refreshToken` presentes | — |

---

## Módulo 3 — Auth: Role Guards

Cobertura de la lógica de autorización por roles: permisos de escritura en `/admin/users`, escalada de privilegios bloqueada y visibilidad filtrada por rol.

| Request | Método | Endpoint | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|----------|-------|-----------------|------------------|---------------------------|
| Create head_coach user | `POST` | `/admin/users` | Admin (`ADMIN_TOKEN`) | `201` ó `409` | `role` = `head_coach` | `HC_USER_ID` |
| Login as head_coach | `POST` | `/auth/login` | head_coach | `200` | `accessToken` presente | `HC_TOKEN` |
| GET /admin/users as head_coach | `GET` | `/admin/users` | head_coach (`HC_TOKEN`) | `200` | Ningún usuario con `role` = `admin` | — |
| GET /admin/users as admin | `GET` | `/admin/users` | Admin (`ADMIN_TOKEN`) | `200` | Al menos un usuario con `role` = `admin` | — |
| POST /admin/users role:admin as head_coach | `POST` | `/admin/users` | head_coach (`HC_TOKEN`) | `403` | `code` = `FORBIDDEN` | — |
| POST /admin/users role:coach as head_coach | `POST` | `/admin/users` | head_coach (`HC_TOKEN`) | `201` ó `409` | `role` = `coach` | `COACH_ID` |
| PATCH coach role:admin as head_coach | `PATCH` | `/admin/users/:COACH_ID` | head_coach (`HC_TOKEN`) | `403` | `code` = `FORBIDDEN` (escalada bloqueada) | — |
| PATCH coach displayName/email/phone | `PATCH` | `/admin/users/:COACH_ID` | head_coach (`HC_TOKEN`) | `200` | `displayName` y `phone` actualizados | — |
| PATCH admin user as head_coach | `PATCH` | `/admin/users/:ADMIN_USER_ID` | head_coach (`HC_TOKEN`) | `403` | `code` = `FORBIDDEN` | — |
| DELETE admin user as head_coach | `DELETE` | `/admin/users/:ADMIN_USER_ID` | head_coach (`HC_TOKEN`) | `403` | `code` = `FORBIDDEN` | — |

---

## Módulo 4 — Auth: Error Cases

Cobertura de errores de autenticación: credenciales incorrectas, tokens inválidos, conflictos de unicidad y recursos inexistentes.

| Request | Método | Endpoint | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|----------|-------|-----------------|------------------|---------------------------|
| Login wrong password | `POST` | `/auth/login` | Anónimo (contraseña errónea) | `401` | — | — |
| GET /auth/me no token | `GET` | `/auth/me` | Sin token | `401` | — | — |
| POST /admin/users as tutor | `POST` | `/admin/users` | Tutor (`TUTOR_TOKEN`) | `403` | `code` = `FORBIDDEN` | — |
| PATCH non-existent user | `PATCH` | `/admin/users/00000000-…` | Admin (`ADMIN_TOKEN`) | `404` | `code` = `NOT_FOUND` | — |
| POST /auth/register duplicate email | `POST` | `/auth/register` | Anónimo (email ya registrado) | `409` | `code` = `CONFLICT` | — |
| GET /auth/me invalid JWT | `GET` | `/auth/me` | Token malformado | `401` | — | — |
| PATCH email to existing one | `PATCH` | `/admin/users/:COACH_ID` | Admin (`ADMIN_TOKEN`) | `409` | `code` = `CONFLICT` | — |

---

## Módulo 5 — Roster

Cobertura de los endpoints de categorías y jugadores del servicio `pats-coapa-roster` (directo, sin gateway).

| Request | Método | Endpoint | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|----------|-------|-----------------|------------------|---------------------------|
| GET /roster/categories | `GET` | `/roster/categories` | Tutor (`X-Actor-Id`) | `200` | 6 categorías, incluye `irons` y `rabbits`, `playerCount` es número, `isActive` es booleano | — |
| POST /roster/players/irons | `POST` | `/roster/players/irons` | Tutor (`X-Actor-Id`, `role=parent`) | `201` | Respuesta `{ id }` | `PLAYER_ID` |
| GET /roster/players/irons | `GET` | `/roster/players/irons` | Admin (`X-Actor-Id`, `role=admin`) | `200` | Array, jugador registrado aparece | — |
| PATCH /roster/player/:id/status active | `PATCH` | `/roster/player/:PLAYER_ID/status` | Admin (`X-Actor-Id`, `role=admin`) | `200` | `status` = `active` | — |
| GET /roster/categories sin X-Actor-Id | `GET` | `/roster/categories` | Sin headers de actor | `401` | `code` = `UNAUTHENTICATED` | — |

---

## Módulo 6 — Gateway

Cobertura del proxy BFF (`pats-coapa-gateway`): validación de JWT, ruteo a servicios downstream, registro vía gateway y verificación de servicio no disponible.

| Request | Método | Endpoint (vía Gateway) | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|------------------------|-------|-----------------|------------------|---------------------------|
| Login via Gateway | `POST` | `/auth/login` | head_coach | `200` | `accessToken` presente | `GW_TOKEN` |
| GET /auth/me via Gateway | `GET` | `/auth/me` | head_coach (`GW_TOKEN`) | `200` | `role` = `head_coach`, `permissions` incluye `users:write` | — |
| GET /roster/categories via Gateway | `GET` | `/roster/categories` | head_coach (`GW_TOKEN`) | `200` | 6 categorías | — |
| GET /auth/me via Gateway sin token | `GET` | `/auth/me` | Sin token | `401` | — | — |
| POST /auth/register via Gateway | `POST` | `/auth/register` | Anónimo | `201` | `id` presente | `GW_TUTOR_EMAIL` |
| POST /auth/refresh via Gateway | `POST` | `/auth/refresh` | GW Tutor (refresh token) | `200` | `accessToken` presente | — |
| GET /admin/users via Gateway | `GET` | `/admin/users` | Admin (`ADMIN_TOKEN`) | `200` | Array de usuarios | — |
| POST /admin/users via Gateway as head_coach | `POST` | `/admin/users` | head_coach (`GW_TOKEN`) | `403` | `code` = `FORBIDDEN` | — |
| GET /roles via Gateway | `GET` | `/roles` | Admin (`ADMIN_TOKEN`) | `200` | Array de roles | — |
| GET /attendance/sessions via Gateway | `GET` | `/attendance/sessions` | Admin (`ADMIN_TOKEN`) | `503` ó `502` | Upstream no disponible (servicio no implementado aún) | — |

---

## Módulo 7 — Roles CRUD

Cobertura completa del recurso `/roles`: creación, consulta, actualización, eliminación y restricciones por permiso. Los IDs son dinámicos (timestamp) para evitar colisiones en re-ejecuciones.

| Request | Método | Endpoint | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|----------|-------|-----------------|------------------|---------------------------|
| GET /roles as admin | `GET` | `/roles` | Admin (`ADMIN_TOKEN`) | `200` | Array, incluye `admin`, al menos 7 roles | — |
| POST /roles as admin | `POST` | `/roles` | Admin (`ADMIN_TOKEN`) | `201` | `id` coincide, `permissions` correctos | `E2E_ROLE_ID`, `E2E_ROLE_NAME`, `E2E_ROLE_NAME_UPDATED` |
| GET /roles/:id as admin | `GET` | `/roles/:E2E_ROLE_ID` | Admin (`ADMIN_TOKEN`) | `200` | `name` y `permissions` coinciden | — |
| PUT /roles/:id as admin | `PUT` | `/roles/:E2E_ROLE_ID` | Admin (`ADMIN_TOKEN`) | `200` | `permissions` actualizados | — |
| DELETE /roles/:id as admin | `DELETE` | `/roles/:E2E_ROLE_ID` | Admin (`ADMIN_TOKEN`) | `204` | Sin body | — |
| GET /roles as head_coach | `GET` | `/roles` | head_coach (`HC_TOKEN`) | `403` | `code` = `FORBIDDEN` (sin `roles:read`) | — |
| POST /roles as head_coach | `POST` | `/roles` | head_coach (`HC_TOKEN`) | `403` | `code` = `FORBIDDEN` (sin `roles:write`) | — |

---

## Módulo 8 — Staff: Access Control

Cobertura de los tres roles staff (`staff`, `staff_admin`, `staff_manager`) y sus restricciones en `/admin/users`.

| Request | Método | Endpoint | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|----------|-------|-----------------|------------------|---------------------------|
| Create staff user | `POST` | `/admin/users` | Admin (`ADMIN_TOKEN`) | `201` | `role` = `staff` | `STAFF_USER_ID`, `STAFF_EMAIL` |
| Login as staff | `POST` | `/auth/login` | staff | `200` | `accessToken` presente | `STAFF_TOKEN` |
| GET /admin/users as staff | `GET` | `/admin/users` | staff (`STAFF_TOKEN`) | `200` | Lista sin admins (filtrado por rol) | — |
| POST /admin/users as staff | `POST` | `/admin/users` | staff (`STAFF_TOKEN`) | `403` | `code` = `FORBIDDEN` (sin `users:write`) | — |
| Create staff_admin user | `POST` | `/admin/users` | Admin (`ADMIN_TOKEN`) | `201` ó `409` | `role` = `staff_admin` | — |
| Login as staff_admin | `POST` | `/auth/login` | staff_admin | `200` | `accessToken` presente | `STAFF_ADMIN_TOKEN` |
| GET /admin/users as staff_admin | `GET` | `/admin/users` | staff_admin (`STAFF_ADMIN_TOKEN`) | `403` | `code` = `FORBIDDEN` (sin `users:read`) | — |
| Create staff_manager user | `POST` | `/admin/users` | Admin (`ADMIN_TOKEN`) | `201` ó `409` | `role` = `staff_manager` | — |
| Login as staff_manager | `POST` | `/auth/login` | staff_manager | `200` | `accessToken` presente | `STAFF_MANAGER_TOKEN` |
| GET /admin/users as staff_manager | `GET` | `/admin/users` | staff_manager (`STAFF_MANAGER_TOKEN`) | `403` | `code` = `FORBIDDEN` (sin `users:read`) | — |

---

## Módulo 9 — Coach: Roster Category Restriction

Cobertura del control de acceso por categoría asignada: un coach puede aprobar jugadores de su categoría, no puede registrar nuevos jugadores, y no puede listar jugadores de categorías no asignadas.

| Request | Método | Endpoint | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|----------|-------|-----------------|------------------|---------------------------|
| Login as coach | `POST` | `/auth/login` | coach | `200` | `accessToken` presente | `COACH_TOKEN` |
| POST /roster/players/irons (tutor) | `POST` | `/roster/players/irons` | Tutor (`X-Actor-Id`, `role=parent`) | `201` | `id` presente | `COACH_PLAYER_ID` |
| PATCH status active como coach — 200 | `PATCH` | `/roster/player/:COACH_PLAYER_ID/status` | coach (`X-Actor-Categories: irons`) | `200` | `status` = `active` | — |
| PATCH status active como coach (ya activo) — 409 | `PATCH` | `/roster/player/:COACH_PLAYER_ID/status` | coach (`X-Actor-Categories: irons`) | `409` | Transición inválida | — |
| GET /roster/players/irons as coach (asignado) | `GET` | `/roster/players/irons` | coach (`X-Actor-Categories: irons`) | `200` | Array | — |
| GET /roster/players/falcons as coach (NO asignado) | `GET` | `/roster/players/falcons` | coach (`X-Actor-Categories: irons`) | `403` | `code` = `FORBIDDEN` | — |
| GET /admin/users as coach | `GET` | `/admin/users` | coach (`COACH_TOKEN`) | `403` | Status 403 (sin `users:read`) | — |

---

## Módulo 10 — Tutor: Ownership

Cobertura del control de acceso por propiedad: un tutor solo puede ver sus propios jugadores; acceder a los jugadores de otro tutor retorna 403.

| Request | Método | Endpoint | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|----------|-------|-----------------|------------------|---------------------------|
| GET /tutor/:id/players — tutor ve sus jugadores | `GET` | `/tutor/:TUTOR_USER_ID/players` | Tutor (`TUTOR_TOKEN`) | `200` | Array con el jugador registrado en módulo 5 | — |
| GET /tutor/:id/players — otro tutor → 403 | `GET` | `/tutor/:HC_USER_ID/players` | Tutor (`TUTOR_TOKEN`) | `403` | `code` = `FORBIDDEN` | — |
| GET /roster/player/:id — tutor owner | `GET` | `/roster/player/:PLAYER_ID` | Tutor (`TUTOR_TOKEN`) | `200` | `id` y `name` presentes | — |
| GET /roster/player/:id — coach diferente categoría | `GET` | `/roster/player/:PLAYER_ID` | coach (`X-Actor-Categories: irons`) | `403` | `code` = `FORBIDDEN` | — |

---

## Módulo 11 — Device Tokens

Cobertura del registro y eliminación de tokens de dispositivo para push notifications.

| Request | Método | Endpoint | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|----------|-------|-----------------|------------------|---------------------------|
| POST /auth/device-token — registrar token | `POST` | `/auth/device-token` | Tutor (`TUTOR_TOKEN`) | `204` | Sin body | — |
| DELETE /auth/device-token — remover token | `DELETE` | `/auth/device-token` | Tutor (`TUTOR_TOKEN`) | `204` | Sin body | — |
| POST /auth/device-token sin auth | `POST` | `/auth/device-token` | Sin token | `401` | — | — |

---

## Módulo 12 — Soft Delete

Cobertura del borrado lógico de usuarios: el usuario eliminado no puede hacer login ni aparece en listados.

| Request | Método | Endpoint | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|----------|-------|-----------------|------------------|---------------------------|
| DELETE /admin/users/:id (staff) as admin | `DELETE` | `/admin/users/:STAFF_USER_ID` | Admin (`ADMIN_TOKEN`) | `204` | Sin body | — |
| Login como usuario soft-deleted | `POST` | `/auth/login` | staff eliminado | `401` | — | — |
| GET /admin/users — soft-deleted no aparece | `GET` | `/admin/users` | Admin (`ADMIN_TOKEN`) | `200` | El usuario staff eliminado no está en la lista | — |

---

## Módulo 13 — Gateway: Roster E2E

Cobertura del flujo completo de roster a través del gateway: registro de jugador, listado, aprobación de status y visibilidad por tutor. Verifica que el gateway inyecta correctamente los headers de actor desde el JWT.

| Request | Método | Endpoint (vía Gateway) | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|------------------------|-------|-----------------|------------------|---------------------------|
| POST /roster/players/falcons via Gateway (tutor) | `POST` | `/roster/players/falcons` | GW Tutor (`GW_TUTOR_EMAIL`, JWT) | `201` | `id` presente | `GW_PLAYER_ID` |
| GET /roster/players/falcons via Gateway (admin) | `GET` | `/roster/players/falcons` | Admin (`ADMIN_TOKEN`) | `200` | Array, jugador GW aparece | — |
| PATCH /roster/player/:id/status active via Gateway | `PATCH` | `/roster/player/:GW_PLAYER_ID/status` | Admin (`ADMIN_TOKEN`) | `200` | `status` = `active` | — |
| GET /tutor/:id/players via Gateway (tutor) | `GET` | `/tutor/:TUTOR_USER_ID/players` | GW Tutor (JWT) | `200` | Array, jugador GW aparece | — |
| POST /roster/players/falcons via Gateway (coach) | `POST` | `/roster/players/falcons` | coach (`GW_TOKEN`) | `403` | `code` = `FORBIDDEN` (rol no permitido para registrar) | — |
| GET /roster/categories via Gateway sin token | `GET` | `/roster/categories` | Sin token | `401` | `code` = `UNAUTHORIZED` | — |

---

## Módulo 14 — Staff & Staff-Manager: Roster Access

Cobertura del acceso al roster para los roles staff. Verifica que `staff` y `staff_admin` no pueden listar ni registrar jugadores sin categoría asignada, mientras que `staff_manager` sí puede registrar pero no listar.

| Request | Método | Endpoint (vía Gateway) | Actor | Status esperado | Assertions clave | Variable(s) que establece |
|---------|--------|------------------------|-------|-----------------|------------------|---------------------------|
| GET /roster/categories como staff | `GET` | `/roster/categories` | staff (`STAFF_TOKEN`) | `200` | 6 categorías (cualquier rol autenticado puede listar) | — |
| GET /roster/players/irons como staff | `GET` | `/roster/players/irons` | staff (`STAFF_TOKEN`) | `403` | `code` = `FORBIDDEN` (sin categoría asignada) | — |
| POST /roster/players/irons como staff | `POST` | `/roster/players/irons` | staff (`STAFF_TOKEN`) | `403` | `code` = `FORBIDDEN` (rol no permitido para registrar) | — |
| GET /roster/categories como staff_admin | `GET` | `/roster/categories` | staff_admin (`STAFF_ADMIN_TOKEN`) | `200` | 6 categorías | — |
| GET /roster/players/irons como staff_admin | `GET` | `/roster/players/irons` | staff_admin (`STAFF_ADMIN_TOKEN`) | `403` | `code` = `FORBIDDEN` (sin categoría asignada) | — |
| GET /roster/categories como staff_manager | `GET` | `/roster/categories` | staff_manager (`STAFF_MANAGER_TOKEN`) | `200` | 6 categorías | — |
| POST /roster/players/irons como staff_manager | `POST` | `/roster/players/irons` | staff_manager (`STAFF_MANAGER_TOKEN`) | `201` | `id` presente (puede registrar jugadores) | `SM_PLAYER_ID` |
| GET /roster/players/irons como staff_manager | `GET` | `/roster/players/irons` | staff_manager (`STAFF_MANAGER_TOKEN`) | `403` | `code` = `FORBIDDEN` (puede registrar pero no listar sin categoría) | — |

---

## Variables de flujo

Lista de todas las variables de colección que los tests establecen dinámicamente durante la ejecución.

| Variable | Establecida en | Módulo | Descripción |
|----------|---------------|--------|-------------|
| `ADMIN_TOKEN` | Admin Login | 1 | Access token del usuario administrador |
| `ADMIN_REFRESH` | Admin Login | 1 | Refresh token del usuario administrador |
| `ADMIN_USER_ID` | Capture Admin User ID | 1 | UUID del usuario administrador |
| `TUTOR_USER_ID` | Register Tutor | 2 | UUID del usuario tutor (rol `parent`) |
| `TUTOR_TOKEN` | Login as Tutor | 2 | Access token del usuario tutor |
| `HC_USER_ID` | Create head_coach user | 3 | UUID del usuario head_coach |
| `HC_TOKEN` | Login as head_coach | 3 | Access token del usuario head_coach |
| `COACH_ID` | POST /admin/users role:coach | 3 | UUID del usuario coach creado por head_coach |
| `E2E_ROLE_ID` | POST /roles | 7 | ID dinámico del rol temporal (timestamp) |
| `E2E_ROLE_NAME` | POST /roles | 7 | Nombre dinámico del rol temporal |
| `E2E_ROLE_NAME_UPDATED` | POST /roles | 7 | Nombre dinámico para el PUT del rol |
| `STAFF_EMAIL` | Create staff user | 8 | Email dinámico del usuario staff (timestamp) |
| `STAFF_USER_ID` | Create staff user | 8 | UUID del usuario staff (también usado en soft delete) |
| `STAFF_TOKEN` | Login as staff | 8 | Access token del usuario staff |
| `STAFF_ADMIN_TOKEN` | Login as staff_admin | 8 | Access token del usuario staff_admin |
| `STAFF_MANAGER_TOKEN` | Login as staff_manager | 8 | Access token del usuario staff_manager |
| `COACH_TOKEN` | Login as coach | 9 | Access token del usuario coach |
| `COACH_PLAYER_ID` | POST /roster/players/irons (tutor) | 9 | UUID del jugador creado para que coach apruebe |
| `PLAYER_ID` | POST /roster/players/irons | 5 | UUID del jugador registrado directamente en roster |
| `GW_TUTOR_EMAIL` | POST /auth/register via Gateway | 6 | Email dinámico del tutor registrado vía gateway |
| `GW_TOKEN` | Login via Gateway | 6 | Access token obtenido a través del gateway (head_coach) |
| `GW_PLAYER_ID` | POST /roster/players/falcons via Gateway | 13 | UUID del jugador registrado vía gateway |
| `SM_PLAYER_ID` | POST /roster/players/irons como staff_manager | 14 | UUID del jugador registrado por staff_manager |

> Las variables `TEST_JERSEY`, `GW_JERSEY`, `COACH_JERSEY`, `SM_JERSEY` son números aleatorios (1-98) generados en pre-request scripts para evitar colisiones en el índice único `(categoryId, jerseyNumber)`.

---

## Roles cubiertos

| Rol | Módulo(s) | Escenarios cubiertos |
|-----|-----------|----------------------|
| `admin` | 1, 2, 3, 4, 5, 6, 7, 12, 13 | Login, CRUD usuarios, CRUD roles, gestión roster, soft delete, flujo gateway completo |
| `head_coach` | 3, 6, 7 | Creación de coaches, guards de privilegios, acceso vía gateway, lectura de roles |
| `coach` | 3, 9, 10 | Aprobación de status de jugadores (categoría asignada), restricción por categoría, bloqueo en categoría no asignada |
| `parent` (tutor) | 2, 4, 5, 9, 10, 11, 13 | Registro, login, registro de jugador, ownership, device tokens, flujo completo vía gateway |
| `staff` | 8, 12, 14 | `users:read` permitido, `users:write` denegado, sin acceso a roster, soft delete |
| `staff_admin` | 8, 14 | Sin `users:read`, sin acceso a roster (ni listar ni registrar) |
| `staff_manager` | 8, 14 | Sin `users:read`, puede registrar jugadores pero no listarlos sin categoría asignada |

---

## Servicios requeridos

Qué servicios deben estar corriendo para ejecutar cada módulo.

| Módulos | Servicios requeridos |
|---------|----------------------|
| 1 – 4, 7 – 8, 11 – 12 | `pats-coapa-auth` |
| 5, 9 – 10 | `pats-coapa-auth`, `pats-coapa-roster` |
| 6, 13 – 14 | `pats-coapa-auth`, `pats-coapa-roster`, `pats-coapa-gateway` |

Para levantar todos los servicios localmente con Tilt:

```bash
cd pats-coapa-infra
tilt up
```

O de forma individual:

```bash
# En cada directorio de servicio
pnpm dev
```

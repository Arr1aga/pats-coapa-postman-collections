# Usuarios E2E — pats-coapa

Usuarios utilizados por la suite Newman (`pats-coapa.e2e.postman_collection.json`).

## Usuarios persistentes

Estos usuarios existen en la BD local (`auth_db`) de forma permanente o se crean en el primer run y se reutilizan en los siguientes.

| Display Name | Email | Password | Role | Notas |
|---|---|---|---|---|
| Admin | `admin@patscoapa.mx` | `b7AlTQSbn5eCib-6` | `admin` | Seed automático al arrancar auth. Viene de `ADMIN_EMAIL` / `ADMIN_PASSWORD` en `.env`. |
| Ana García | `tutor1@test.com` | `pass123` | `parent` | Registrada por `/auth/register`. Se acepta 201 o 409 (idempotente). |
| Head Coach | `hc@test.com` | `pass123` | `head_coach` | Creada por admin en folder 3. |
| Coach 1 | `coach1@test.com` | `pass123` | `coach` | Creada por head_coach en folder 3. Categorías asignadas: `irons`. |
| Staff Admin 1 | `staffadmin1@test.com` | `pass123` | `staff_admin` | Creada por admin en folder 8. |
| Staff Manager 1 | `staffmanager1@test.com` | `pass123` | `staff_manager` | Creada por admin en folder 8. Puede registrar jugadores pero no listarlos sin categoría asignada. |
| GW Tutor | `gw_tutor_<timestamp>@test.com` | `Password123!` | `parent` | Email dinámico (`Date.now()`). Registrada via Gateway en folder 6. |

## Usuarios efímeros (se crean y eliminan en el mismo run)

| Display Name | Email | Password | Role | Notas |
|---|---|---|---|---|
| Staff 1 | `staff_<timestamp>@test.com` | `pass123` | `staff` | Email dinámico. Creada en folder 8, soft-deleted en folder 12 para verificar que no puede loguearse. |

## Credenciales para desarrollo local

Para iniciar sesión manualmente en la app o en Postman:

```
Admin:          admin@patscoapa.mx   /  b7AlTQSbn5eCib-6
Tutor (parent): tutor1@test.com      /  pass123
Head Coach:     hc@test.com          /  pass123
Coach:          coach1@test.com      /  pass123
Staff Admin:    staffadmin1@test.com /  pass123
Staff Manager:  staffmanager1@test.com / pass123
```

> Las credenciales del admin vienen del archivo `.env` del servicio `pats-coapa-auth` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).  
> El resto de usuarios de prueba usan `pass123` por simplicidad en dev/CI.

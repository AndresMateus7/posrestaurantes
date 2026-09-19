-- Solo datos, sin cambios de esquema. Antes, abrir una mesa guardaba como "mesero"
-- a quien la abria aunque fuera caja o admin, y las mesas que se liberaban
-- conservaban su mesero. Ahora Mesa.mesero_id significa "mesero responsable":
-- solo se asigna cuando la abre un mesero y se limpia al cerrar la cuenta.
-- Estas mesas quedan sin asignar para que cualquier mesero pueda tomarlas.
UPDATE "mesas"
SET "mesero_id" = NULL
WHERE "mesero_id" IN (SELECT "id" FROM "usuarios" WHERE "rol" <> 'mesero')
   OR "estado" IN ('libre', 'reservada');

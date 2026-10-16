# Inventario-de-Baggtag-y-BoarningPass
Un mini inventario que nos ayuda a llevar un mejor control de papeleria 

## Ejecutar con Flask

1. Instala las dependencias con `py -m pip install -r requirements.txt`.
2. Copia `.env.example` como `.env` y configura `DB_CONN` con el servidor,
   usuario y contraseña SQL autorizados para `InventarioBagtags`.
3. Inicia la aplicación con `py app.py`.
4. Abre `http://127.0.0.1:5000`.

La cuenta de base de datos necesita acceso de lectura y escritura a
`InventarioBagtags`, ejecución de `sp_RegistrarCaja` y
`sp_RegistrarMovimiento`, permisos para actualizar el estado de las cajas y
crear las tablas de entregas al ejecutar el script de instalación.
No compartas el archivo `.env`.

Los consumos se distribuyen entre los rollos con menos unidades disponibles
primero; registrar un rollo completo consume sus unidades restantes. El
responsable es obligatorio. Las cajas solo se pueden anular si no tienen
movimientos. El reporte de stock mínimo usa un umbral del 10% de las unidades
iniciales activas por tipo de producto.

Las salidas tienen dos modos: **Kiosko** descuenta unidades de una caja y
registra el responsable; **Aerolínea** requiere el nombre de la aerolínea,
tipo, cantidad, códigos exactos y persona que recibe. Ejecuta
`sql\entregas.sql` una sola vez en `InventarioBagtags` para crear las tablas
del historial de entregas. Las cajas entregadas conservan sus rollos como
historial, quedan con estado `ENTREGADA` y dejan de contarse como inventario
disponible.

**Anular** cambia el estado de una caja sin eliminarla; solo se permite si no
tiene consumos ni fue entregada. **Eliminar** borra permanentemente cajas
anuladas, agotadas o entregadas, junto con sus rollos, consumos y vínculo de
entrega. Si la entrega incluye otras cajas, se conserva su registro y los
vínculos restantes; si era la única caja de esa entrega, también se elimina
el registro vacío. Esta acción no se puede deshacer.

Si varias cajas físicas pueden compartir el mismo código, ejecuta
`sql\permitir_codigos_caja_repetidos.sql` una sola vez en `InventarioBagtags`.
El sistema identifica cada caja por su `IdCaja`; al entregar, se selecciona
cada caja física por separado, incluso cuando sus códigos coinciden.

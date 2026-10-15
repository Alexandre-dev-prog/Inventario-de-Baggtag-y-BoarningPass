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
`sp_RegistrarMovimiento`, y permisos para actualizar el estado de las cajas.
No compartas el archivo `.env`.

Los consumos se distribuyen entre los rollos con menos unidades disponibles
primero; registrar un rollo completo consume sus unidades restantes. El
responsable es obligatorio. Las cajas solo se pueden anular si no tienen
movimientos. El reporte de stock mínimo usa un umbral del 10% de las unidades
iniciales activas por tipo de producto.

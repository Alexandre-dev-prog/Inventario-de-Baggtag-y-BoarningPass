IF OBJECT_ID('dbo.Caja', 'U') IS NULL
BEGIN
    THROW 50001, 'No existe la tabla dbo.Caja en la base de datos actual.', 1;
END;

DECLARE @ConstraintName sysname;
DECLARE @IndexName sysname;
DECLARE @Command nvarchar(max);

DECLARE caja_constraints CURSOR LOCAL FAST_FORWARD FOR
    SELECT DISTINCT kc.name
    FROM sys.key_constraints AS kc
    JOIN sys.index_columns AS ic
        ON ic.object_id = kc.parent_object_id
        AND ic.index_id = kc.unique_index_id
    JOIN sys.columns AS c
        ON c.object_id = ic.object_id
        AND c.column_id = ic.column_id
    WHERE kc.parent_object_id = OBJECT_ID('dbo.Caja')
        AND kc.type = 'UQ'
        AND ic.key_ordinal > 0
        AND c.name = 'Codigo';

OPEN caja_constraints;
FETCH NEXT FROM caja_constraints INTO @ConstraintName;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @Command = N'ALTER TABLE dbo.Caja DROP CONSTRAINT '
        + QUOTENAME(@ConstraintName) + N';';
    EXEC sys.sp_executesql @Command;
    FETCH NEXT FROM caja_constraints INTO @ConstraintName;
END;
CLOSE caja_constraints;
DEALLOCATE caja_constraints;

DECLARE caja_indexes CURSOR LOCAL FAST_FORWARD FOR
    SELECT DISTINCT i.name
    FROM sys.indexes AS i
    JOIN sys.index_columns AS ic
        ON ic.object_id = i.object_id
        AND ic.index_id = i.index_id
    JOIN sys.columns AS c
        ON c.object_id = ic.object_id
        AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID('dbo.Caja')
        AND i.is_unique = 1
        AND i.is_primary_key = 0
        AND i.is_unique_constraint = 0
        AND i.name IS NOT NULL
        AND ic.key_ordinal > 0
        AND c.name = 'Codigo';

OPEN caja_indexes;
FETCH NEXT FROM caja_indexes INTO @IndexName;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @Command = N'DROP INDEX ' + QUOTENAME(@IndexName)
        + N' ON dbo.Caja;';
    EXEC sys.sp_executesql @Command;
    FETCH NEXT FROM caja_indexes INTO @IndexName;
END;
CLOSE caja_indexes;
DEALLOCATE caja_indexes;

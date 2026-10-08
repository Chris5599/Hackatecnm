-- =====================================================================
--  SONORA · Integración con blockchain (ejecutar DESPUÉS de schema.sql)
--  Permite guardar el hash de la transacción (tx_hash) de cada pago
--  hecho con los smart contracts en Base Sepolia.
--  Se puede volver a ejecutar sin problema.
-- =====================================================================

-- 1. El navegador puede guardar el hash, pero solo si tiene formato válido
--    (0x + 64 caracteres hex) y nunca puede cambiar uno ya guardado.
--    El hash es verificable públicamente en https://sepolia.basescan.org
create or replace function public.protect_tx_hash()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    if new.tx_hash is not null and new.tx_hash !~ '^0x[0-9a-fA-F]{64}$' then
      new.tx_hash := null;
    end if;
    if tg_op = 'UPDATE' and old.tx_hash is not null then
      new.tx_hash := old.tx_hash;
    end if;
  end if;
  return new;
end;
$$;

-- 2. Registrar el pago de una reserva ya creada (solo su dueño y una sola vez)
create or replace function public.set_booking_tx(p_booking_id uuid, p_tx_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' then
    raise exception 'Hash de transacción inválido.';
  end if;
  update public.bookings
     set tx_hash = p_tx_hash
   where id = p_booking_id
     and user_id = auth.uid()
     and tx_hash is null;
  if not found then
    raise exception 'Reserva no encontrada o ya registrada en blockchain.';
  end if;
end;
$$;

revoke all on function public.set_booking_tx(uuid, text) from public;
grant execute on function public.set_booking_tx(uuid, text) to authenticated;

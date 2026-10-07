-- Testes de aceitacao das migrations do projeto sobre o stub do banco REAL.
-- Cada DO block lanca excecao se o invariante nao valer; com ON_ERROR_STOP=1
-- qualquer falha derruba o psql com exit != 0.
-- Resultados de RPC vao para temp tables: psql NAO interpola :vars em $$..$$.

\set ON_ERROR_STOP on

\echo '--- 1. cadastro: profile criado pelo handle_new_user DO banco real'
insert into auth.users (id, email, raw_user_meta_data)
values ('33333333-3333-3333-3333-333333333333', 'novo@exemplo.com',
        jsonb_build_object('full_name', 'Novo Usuario', 'role', 'admin'));

do $$
declare p record;
begin
  -- o handle_new_user real insere (user_id, email, full_name) e nada mais;
  -- role/status/kyc_status sao defaults da coluna e o metadata nao escala o
  -- papel (a promocao a admin so via update/SQL, como no banco real).
  select user_id, email, full_name, role, status into p
    from public.profiles
   where user_id = '33333333-3333-3333-3333-333333333333';

  if not found then raise exception 'FAIL: profile nao criado pelo trigger'; end if;
  if p.role <> 'user' then
    raise exception 'FAIL: escalada por metadata! role = %', p.role;
  end if;
  if p.status <> 'active' then raise exception 'FAIL: status inicial'; end if;
  if p.email <> 'novo@exemplo.com' then raise exception 'FAIL: email'; end if;
  raise notice 'ok: perfil criado user/active pelo trigger real (sem username/referral)';
end $$;

do $$
declare w record;
begin
  -- o bando real tem trigger sync_profile_to_wallet_balances (AFTER INSERT/UPDATE
  -- em profiles): a wallet do novo usuario nasce zerada ja no cadastro.
  select wallet_balance, bonus_balance, locked_balance, yield_balance into w
    from public.wallet_balances
   where user_id = '33333333-3333-3333-3333-333333333333';
  if not found then raise exception 'FAIL: wallet nao criada pelo trigger real'; end if;
  if w.wallet_balance <> 0 or w.bonus_balance <> 0
     or w.locked_balance <> 0 or w.yield_balance <> 0 then
    raise exception 'FAIL: wallet nova com saldo fora de zero';
  end if;
  raise notice 'ok: wallet zerada criada pelo trigger sync_profile_to_wallet_balances';
end $$;

\echo '--- 2. deposito: pedido trava valor, aprovacao credita + bonus'
set role authenticated;
set test.local_uid = '11111111-1111-1111-1111-111111111111';

-- request_deposit(p_amount, p_method, p_txid, p_reference, p_wallet_address)
create temp table _dep as
select public.request_deposit(p_amount => 100, p_txid => 'ABCD1234') as deposit_id;
grant select on _dep to public;

do $$
declare w record; d record;
begin
  select wallet_balance, locked_balance into w
    from public.wallet_balances where user_id = '11111111-1111-1111-1111-111111111111';
  if w.wallet_balance <> 1000 then raise exception 'FAIL: saldo devia ser 1000, veio %', w.wallet_balance; end if;
  if w.locked_balance <> 100 then raise exception 'FAIL: locked_balance devia ser 100, veio %', w.locked_balance; end if;

  select status, method, user_id into d from public.deposits where id = (select deposit_id from _dep);
  if d.status <> 'pending' then raise exception 'FAIL: status do pedido: %', d.status; end if;
  if d.method <> 'pix' then raise exception 'FAIL: method do pedido: %', d.method; end if;
  if d.user_id <> '11111111-1111-1111-1111-111111111111' then raise exception 'FAIL: user_id do pedido'; end if;
  raise notice 'ok: pedido pendente (pix) e valor travado em locked_balance';
end $$;

\echo '--- 3. usuario comum NAO consegue aprovar proprio deposito'
do $$
begin
  perform public.approve_deposit_atomic((select deposit_id from _dep),
                                        '11111111-1111-1111-1111-111111111111');
  raise exception 'FAIL: usuario comum aprovou deposito';
exception
  when insufficient_privilege then
    raise notice 'ok: approve_deposit_atomic negado para usuario comum';
end $$;

\echo '--- 4. aprovacao pelo admin credita saldo + bonus 100% primeiro deposito'
reset role;
reset test.local_uid;
set role service_role;
set test.local_uid = '22222222-2222-2222-2222-222222222222';

do $$
declare s numeric;
begin
  s := public.approve_deposit_atomic((select deposit_id from _dep),
                                      '22222222-2222-2222-2222-222222222222');
  if s <> 1100 then raise exception 'FAIL: saldo devolvido pela RPC = % (esperado 1100)', s; end if;
  raise notice 'ok: RPC devolveu saldo 1100';
end $$;

do $$
declare w record; d record; l integer;
begin
  select wallet_balance, locked_balance, bonus_balance into w
    from public.wallet_balances where user_id = '11111111-1111-1111-1111-111111111111';
  if w.wallet_balance <> 1100 then raise exception 'FAIL: saldo pos-deposito % (esperado 1100)', w.wallet_balance; end if;
  if w.locked_balance <> 0 then raise exception 'FAIL: locked nao zerou: %', w.locked_balance; end if;
  -- seed do stub ja traz bonus 100; o primeiro deposito aprovado soma +100
  if w.bonus_balance <> 200 then raise exception 'FAIL: bonus % (esperado 200 = 100 seed + 100 boas-vindas)', w.bonus_balance; end if;

  -- vocabulario deste banco: deposits.status gravado como 'confirmed'
  select status into d from public.deposits where id = (select deposit_id from _dep);
  if d.status <> 'confirmed' then raise exception 'FAIL: status apos aprovacao: % (esperado confirmed)', d.status; end if;

  select count(*) into l from public.financial_ledger
   where user_id = '11111111-1111-1111-1111-111111111111' and type in ('deposit','bonus');
  if l <> 2 then raise exception 'FAIL: lancamentos de deposito/bonus = % (esperado 2)', l; end if;
  raise notice 'ok: saldo 1100, bonus 200 (seed + boas-vindas), locked zerado, 2 lancamentos (types minusculos)';
end $$;

\echo '--- 5. aprovacao repetida e recusada'
do $$
begin
  perform public.approve_deposit_atomic((select deposit_id from _dep),
                                        '22222222-2222-2222-2222-222222222222');
  raise exception 'FAIL: aprovou deposito ja aprovado (pagaria duas vezes)';
exception
  when raise_exception then
    if sqlerrm like 'Deposito ja esta%' then
      raise notice 'ok: segunda aprovacao recusada';
    else
      raise;
    end if;
end $$;

\echo '--- 6. dados de partida (superuser: RLS nao tem policy de INSERT)'
reset role;
reset test.local_uid;

insert into public.leagues (id, name, country)
values ('aaaaaaa1-0000-0000-0000-000000000001', 'Liga Teste', 'Brasil');
insert into public.teams (id, name)
values ('bbbbbbb1-0000-0000-0000-000000000001', 'Time Casa'),
       ('bbbbbbb1-0000-0000-0000-000000000002', 'Time Fora');
insert into public.matches (id, league_id, home_team_id, away_team_id, status, kickoff_at)
values ('ccccccc1-0000-0000-0000-000000000001', 'aaaaaaa1-0000-0000-0000-000000000001',
        'bbbbbbb1-0000-0000-0000-000000000001', 'bbbbbbb1-0000-0000-0000-000000000002',
        'OPEN', now() + interval '2 days');
insert into public.match_markets (id, match_id, name, category)
values ('ddddddd1-0000-0000-0000-000000000001', 'ccccccc1-0000-0000-0000-000000000001',
        'Resultado Final', 'main');
insert into public.market_choices (id, market_id, label, odds)
values ('eeeeeee1-0000-0000-0000-000000000001', 'ddddddd1-0000-0000-0000-000000000001', 'Vitoria Casa', 2.50),
       ('eeeeeee1-0000-0000-0000-000000000002', 'ddddddd1-0000-0000-0000-000000000001', 'Empate', 3.10);

\echo '--- 7. aposta esportiva recalcula a odd do banco'
set role authenticated;
set test.local_uid = '11111111-1111-1111-1111-111111111111';

-- place_bet_atomic(p_type text, p_selections jsonb, p_stake numeric)
create temp table _bet as
select * from public.place_bet_atomic('single',
        jsonb_build_array(jsonb_build_object('choiceId', 'eeeeeee1-0000-0000-0000-000000000001')),
        10);
grant select on _bet to public;

do $$
declare w numeric; b record; t record;
begin
  select * into t from _bet;
  select * into b from public.bets where id = t.bet_id;

  if round(t.total_odds, 2) <> 2.50 then
    raise exception 'FAIL: odd vinda do cliente ignorada, total_odds = %', t.total_odds;
  end if;
  if round(t.potential_return, 2) <> 25.00 then
    raise exception 'FAIL: payout % (esperado 25.00)', t.potential_return;
  end if;
  if b.stake <> 10 then raise exception 'FAIL: stake %', b.stake; end if;

  select wallet_balance into w from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  if w <> 1090 then raise exception 'FAIL: saldo pos-aposta % (esperado 1090)', w; end if;

  if b.status <> 'OPEN' then raise exception 'FAIL: status da aposta: %', b.status; end if;
  if b.election_contest_id is not null then raise exception 'FAIL: aposta esportiva ganhou contest'; end if;

  select count(*) into w from public.financial_ledger
   where user_id = '11111111-1111-1111-1111-111111111111' and type = 'bet';
  if w <> 1 then raise exception 'FAIL: ledger de aposta nao gravado'; end if;
  raise notice 'ok: odd recalculada (2.50), retorno 25.00, debito de 10, saldo 1090, ledger type bet';
end $$;

\echo '--- 8. selecao invalida derruba a aposta inteira'
do $$
begin
  perform public.place_bet_atomic('single',
    jsonb_build_array(jsonb_build_object('choiceId', 'eeeeeee1-0000-0000-0000-000000000001'),
                      jsonb_build_object('choiceId', '00000000-0000-0000-0000-000000000000')),
    10);
  raise exception 'FAIL: aceitou selecao inexistente';
exception
  when raise_exception then
    if sqlerrm = 'Selecao inexistente' then
      raise notice 'ok: selecao invalida recusada';
    else
      raise;
    end if;
end $$;

do $$
declare w numeric;
begin
  select wallet_balance into w from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  if w <> 1090 then raise exception 'FAIL: aposta rejeitada nao pode debitar (saldo %)', w; end if;
  raise notice 'ok: saldo intacto depois da recusa';
end $$;

\echo '--- 9. saldo insuficiente nao vira saldo negativo'
do $$
declare w numeric;
begin
  select wallet_balance into w from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  perform public.place_bet_atomic('single',
    jsonb_build_array(jsonb_build_object('choiceId', 'eeeeeee1-0000-0000-0000-000000000001')),
    w + 1);
  raise exception 'FAIL: apostou acima do saldo';
exception
  when raise_exception then
    if sqlerrm = 'Saldo insuficiente' then
      raise notice 'ok: aposta maior que o saldo recusada';
    else
      raise;
    end if;
end $$;

\echo '--- 10. liquidacao: vitoria credita, derrota nao'
reset role;
reset test.local_uid;
set role service_role;
set test.local_uid = '22222222-2222-2222-2222-222222222222';

do $$
declare s numeric;
begin
  s := public.settle_bet_atomic((select bet_id from _bet), 'WON', 25.00);
  if s <> 1115 then raise exception 'FAIL: saldo pos-liquidacao % (esperado 1115)', s; end if;
  raise notice 'ok: vitoria creditou 25 (1090 -> 1115)';
end $$;

do $$
declare b record;
begin
  select status, actual_return into b from public.bets where id = (select bet_id from _bet);
  if b.status <> 'WON' or b.actual_return <> 25 then
    raise exception 'FAIL: aposta nao liquidada: % / %', b.status, b.actual_return;
  end if;
end $$;

do $$
begin
  perform public.settle_bet_atomic((select bet_id from _bet), 'WON', 999);
  raise exception 'FAIL: liquidou aposta ja liquidada';
exception
  when raise_exception then
    if sqlerrm like 'Aposta ja esta%' then
      raise notice 'ok: reliquidacao recusada';
    else
      raise;
    end if;
end $$;

-- derrota: nao mexe no saldo (INSERT em bets sem policy de RLS -> superuser)
reset role;
reset test.local_uid;
insert into public.bets (id, user_id, type, status, selections, total_odds, stake, potential_return)
values ('ffffffff-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'single', 'OPEN', '[]'::jsonb, 2.00, 5, 10);
set role service_role;
set test.local_uid = '22222222-2222-2222-2222-222222222222';

do $$
declare w numeric;
begin
  perform public.settle_bet_atomic('ffffffff-0000-0000-0000-000000000001', 'LOST', 0);

  select wallet_balance into w from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  if w <> 1115 then raise exception 'FAIL: derrota mexeu no saldo: %', w; end if;
  raise notice 'ok: derrota nao devolve stake (saldo inalterado)';
end $$;

\echo '--- 11. saque: debita na hora, estorno devolve'
reset role;
reset test.local_uid;
set role authenticated;
set test.local_uid = '11111111-1111-1111-1111-111111111111';

-- request_withdraw(p_amount, p_method, p_destination)
create temp table _wd as
select public.request_withdraw(50, 'pix', '12345678901') as withdraw_id;
grant select on _wd to public;

do $$
declare w numeric; d record;
begin
  select wallet_balance into w from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  if w <> 1065 then raise exception 'FAIL: saldo pos-pedido de saque % (esperado 1065)', w; end if;

  select method, destination_address, status into d
    from public.withdrawals where id = (select withdraw_id from _wd);
  if d.method <> 'pix' then raise exception 'FAIL: method do saque: %', d.method; end if;
  if d.destination_address <> '12345678901' then raise exception 'FAIL: destination: %', d.destination_address; end if;
  if d.status <> 'pending' then raise exception 'FAIL: status do saque: %', d.status; end if;
  raise notice 'ok: saque debitou no pedido (1115 -> 1065) c/ method+destination';
end $$;

-- saque acima do saldo
do $$
declare w numeric;
begin
  select wallet_balance into w from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  perform public.request_withdraw(w + 1, 'pix', '12345678901');
  raise exception 'FAIL: sacou acima do saldo';
exception
  when raise_exception then
    if sqlerrm = 'Saldo insuficiente' then
      raise notice 'ok: saque acima do saldo recusado';
    else
      raise;
    end if;
end $$;

-- estorno pelo admin
reset role;
reset test.local_uid;
set role service_role;
set test.local_uid = '22222222-2222-2222-2222-222222222222';

do $$
declare w numeric; d record;
begin
  perform public.reject_withdrawal_atomic((select withdraw_id from _wd),
                                          '22222222-2222-2222-2222-222222222222');
  select wallet_balance into w from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  if w <> 1115 then raise exception 'FAIL: estorno nao devolveu (saldo %)', w; end if;
  select status into d from public.withdrawals where id = (select withdraw_id from _wd);
  if d.status <> 'rejected' then raise exception 'FAIL: status do saque: %', d.status; end if;
  raise notice 'ok: estorno devolveu 50 (1065 -> 1115) e marcou rejected';
end $$;

reset role;
reset test.local_uid;
set role authenticated;
set test.local_uid = '11111111-1111-1111-1111-111111111111';
\echo '--- 12. usuario comum nao liquida aposta nem acessa RPCs de admin'
do $$
begin
  perform public.settle_bet_atomic('ffffffff-0000-0000-0000-000000000001', 'WON', 100);
  raise exception 'FAIL: usuario comum liquidou aposta';
exception
  when insufficient_privilege then
    raise notice 'ok: settle_bet_atomic negado para usuario comum';
end $$;

do $$
begin
  perform public.set_user_status('11111111-1111-1111-1111-111111111111',
                                 'blocked', '11111111-1111-1111-1111-111111111111');
  raise exception 'FAIL: usuario comum mudou status';
exception
  when insufficient_privilege then
    raise notice 'ok: set_user_status negado para usuario comum';
end $$;

\echo '--- 13. dados eleitorais: vem do seed da 0003 (nada a criar aqui)'
reset role;
reset test.local_uid;

create temp table _contest as
select id, status from public.election_contests where scope = 'PRESIDENT' order by title limit 1;
grant select on _contest to public;

create temp table _cand as
select id, name, odds from public.election_candidates
 where contest_id = (select id from _contest) and is_active
 order by sort_order limit 1;
grant select on _cand to public;

do $$
declare n integer;
begin
  select count(*) into n from _contest;
  if n <> 1 then raise exception 'FAIL: seed sem concurso PRESIDENT'; end if;
  select count(*) into n from _cand;
  if n <> 1 then raise exception 'FAIL: seed sem candidato ativo'; end if;
  raise notice 'ok: concurso e candidato capturados do seed (odd %)',
               (select odds from _cand);
end $$;

\echo '--- 14. aposta eleitoral usa wallet_balances e grava election_contest_id'
set role authenticated;
set test.local_uid = '11111111-1111-1111-1111-111111111111';

create temp table _eb as
select * from public.place_election_bet_atomic((select id from _contest),
        (select id from _cand), 20);
grant select on _eb to public;

do $$
declare w numeric; b record; t record;
begin
  select * into t from _eb;
  select * into b from public.bets where id = t.bet_id;

  if round(t.potential_return, 2) <> round(20 * (select odds from _cand), 2) then
    raise exception 'FAIL: retorno eleitoral % (esperado 20 x odd do seed)', t.potential_return;
  end if;
  if t.odds <> (select odds from _cand) then
    raise exception 'FAIL: odd eleitoral % (esperado %)', t.odds, (select odds from _cand);
  end if;
  if t.candidate_name <> (select name from _cand) then raise exception 'FAIL: nome: %', t.candidate_name; end if;
  if b.election_contest_id is null then raise exception 'FAIL: aposta eleitoral sem contest'; end if;
  if b.type <> 'single' then raise exception 'FAIL: type da aposta eleitoral: %', b.type; end if;

  select wallet_balance into w from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  if w <> 1095 then raise exception 'FAIL: saldo pos-aposta eleitoral % (esperado 1095)', w; end if;
  raise notice 'ok: aposta eleitoral debita de wallet_balances e linka contest';
end $$;

\echo '--- 15. usuario comum nao ajusta odd eleitoral'
do $$
begin
  perform public.set_election_candidate_odd_atomic((select id from _cand),
        10, '11111111-1111-1111-1111-111111111111');
  raise exception 'FAIL: usuario comum mudou odd eleitoral';
exception
  when insufficient_privilege then
    raise notice 'ok: set_election_candidate_odd_atomic negado para usuario comum';
end $$;

\echo '--- 16. admin ajusta odd e o historico guarda o valor anterior'
reset role;
reset test.local_uid;
set role service_role;
set test.local_uid = '22222222-2222-2222-2222-222222222222';

do $$
declare c record; h record;
begin
  perform public.set_election_candidate_odd_atomic((select id from _cand),
        6.25, '22222222-2222-2222-2222-222222222222');

  select odds, previous_odds into c from public.election_candidates
   where id = (select id from _cand);
  if c.odds <> 6.25 or c.previous_odds <> (select odds from _cand) then
    raise exception 'FAIL: odd % / anterior % (esperado 6.25 / odd do seed)', c.odds, c.previous_odds;
  end if;

  select odds, previous_odds, changed_by into h from public.election_odds_history
   where candidate_id = (select id from _cand)
   order by changed_at desc limit 1;
  if h.odds <> 6.25 or h.previous_odds <> (select odds from _cand) then
    raise exception 'FAIL: historico inconsistente (odds % / anterior %)', h.odds, h.previous_odds;
  end if;
  if h.changed_by <> '22222222-2222-2222-2222-222222222222' then
    raise exception 'FAIL: changed_by = %', h.changed_by;
  end if;
  raise notice 'ok: odd do seed -> 6.25 com historico preservando o valor anterior';
end $$;

\echo '--- 17. RLS: usuario le so a propria carteira e extrato'
reset role;
reset test.local_uid;
set role authenticated;
set test.local_uid = '11111111-1111-1111-1111-111111111111';

do $$
declare n integer;
begin
  select count(*) into n from public.wallet_balances;
  if n <> 1 then raise exception 'FAIL: carteiras visiveis = % (esperado 1: a do proprio)', n; end if;
  select count(*) into n from public.financial_ledger;
  if n < 1 then raise exception 'FAIL: extrato proprio vazio'; end if;
  select count(*) into n from public.deposits;
  if n <> 1 then raise exception 'FAIL: depositos visiveis = % (esperado 1: o proprio ate aqui)', n; end if;
  select count(*) into n from public.withdrawals;
  if n <> 1 then raise exception 'FAIL: saques visiveis = % (esperado 1: os proprios)', n; end if;
  raise notice 'ok: RLS limita carteira/extrato/depositos/saques ao proprio usuario';
end $$;

\echo '--- 18. perfil proprio ileso e com os novos campos do banco real'
do $$
declare p record;
begin
  select role, status, kyc_status into p from public.profiles where user_id = '11111111-1111-1111-1111-111111111111';
  if p.role <> 'user' or p.status <> 'active' then
    raise exception 'FAIL: perfil proprio alterado: % / %', p.role, p.status;
  end if;
  if p.kyc_status is distinct from 'pending' then
    raise exception 'FAIL: kyc_status do banco real quebrado: %', p.kyc_status;
  end if;
  raise notice 'ok: perfil proprio ileso (role user, status active, kyc pending)';
end $$;

\echo '--- 19. segundo deposito aprovado NAO paga bonus de boas-vindas'
reset role;
reset test.local_uid;
set role authenticated;
set test.local_uid = '11111111-1111-1111-1111-111111111111';

create temp table _dep2 as
select public.request_deposit(p_amount => 50, p_txid => 'SEGDEP1234') as deposit_id;
grant select on _dep2 to public;

reset role;
reset test.local_uid;
set role service_role;
set test.local_uid = '22222222-2222-2222-2222-222222222222';

do $$
declare w record; n integer;
begin
  perform public.approve_deposit_atomic((select deposit_id from _dep2),
                                        '22222222-2222-2222-2222-222222222222');

  select wallet_balance, bonus_balance into w from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  if w.wallet_balance <> 1145 then raise exception 'FAIL: saldo % (esperado 1145)', w.wallet_balance; end if;
  if w.bonus_balance <> 200 then raise exception 'FAIL: bonus % (esperado 200: sem novo bonus)', w.bonus_balance; end if;

  select count(*) into n from public.financial_ledger
   where user_id = '11111111-1111-1111-1111-111111111111'
     and type in ('deposit','bonus');
  if n <> 3 then raise exception 'FAIL: lancamentos = % (esperado 3: dep, bonus, dep)', n; end if;
  raise notice 'ok: segundo deposito creditou so o principal (sem bonus repetido)';
end $$;

reset role;
reset test.local_uid;

\echo '--- 20. bonus de multipla: escada 5/10/15/25% aplicada pelo BANCO'
insert into public.market_choices (id, market_id, label, odds)
values ('eeeeeee1-0000-0000-0000-000000000003', 'ddddddd1-0000-0000-0000-000000000001', 'Over 2.5', 1.50),
       ('eeeeeee1-0000-0000-0000-000000000004', 'ddddddd1-0000-0000-0000-000000000001', 'Ambas marcam', 2.00),
       ('eeeeeee1-0000-0000-0000-000000000005', 'ddddddd1-0000-0000-0000-000000000001', 'Handicap -1', 1.80);

set role authenticated;
set test.local_uid = '11111111-1111-1111-1111-111111111111';

do $$
declare
  c2 jsonb;
  c3 jsonb;
  c4 jsonb;
  c5 jsonb;
  b record;
  w0 numeric;
  w1 numeric;
  n integer;
begin
  c2 := jsonb_build_array(
    jsonb_build_object('choiceId', 'eeeeeee1-0000-0000-0000-000000000001'),
    jsonb_build_object('choiceId', 'eeeeeee1-0000-0000-0000-000000000002'));
  c3 := c2 || jsonb_build_array(jsonb_build_object('choiceId', 'eeeeeee1-0000-0000-0000-000000000003'));
  c4 := c3 || jsonb_build_array(jsonb_build_object('choiceId', 'eeeeeee1-0000-0000-0000-000000000004'));
  c5 := c4 || jsonb_build_array(jsonb_build_object('choiceId', 'eeeeeee1-0000-0000-0000-000000000005'));

  select wallet_balance into w0 from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';

  -- 2 selecoes: 2.50 x 3.10 = 7.75 -> 10 x 7.75 = 77.50 -> +5% = 81.38
  select * into b from public.place_bet_atomic('multiple', c2, 10);
  if round(b.total_odds, 2) <> 7.75 then
    raise exception 'FAIL: odd de 2 selecoes = % (esperado 7.75)', b.total_odds;
  end if;
  if b.potential_return <> 81.38 then
    raise exception 'FAIL: retorno 2 selecoes = % (esperado 81.38 = 5%% de bonus)', b.potential_return;
  end if;

  -- 3 selecoes: 7.75 x 1.50 = 11.625 -> 116.25 -> +10% = 127.88
  select * into b from public.place_bet_atomic('multiple', c3, 10);
  if round(b.total_odds, 3) <> 11.625 then
    raise exception 'FAIL: odd de 3 selecoes = % (esperado 11.625)', b.total_odds;
  end if;
  if b.potential_return <> 127.88 then
    raise exception 'FAIL: retorno 3 selecoes = % (esperado 127.88 = 10%% de bonus)', b.potential_return;
  end if;

  -- 4 selecoes: 11.625 x 2.00 = 23.25 -> 232.50 -> +15% = 267.38
  select * into b from public.place_bet_atomic('multiple', c4, 10);
  if b.potential_return <> 267.38 then
    raise exception 'FAIL: retorno 4 selecoes = % (esperado 267.38 = 15%% de bonus)', b.potential_return;
  end if;

  -- 5 selecoes (teto): 23.25 x 1.80 = 41.85 -> 418.50 -> +25% = 523.13
  select * into b from public.place_bet_atomic('multiple', c5, 10);
  if b.potential_return <> 523.13 then
    raise exception 'FAIL: retorno 5 selecoes = % (esperado 523.13 = 25%% de bonus)', b.potential_return;
  end if;

  -- O tipo gravado tem que ser combo: a aposta com N>1 selecoes e multiple.
  select count(*) into n from public.bets
   where user_id = '11111111-1111-1111-1111-111111111111'
     and type = 'multiple' and stake = 10
     and status = 'OPEN' and placed_at > now() - interval '1 minute';
  if n <> 4 then raise exception 'FAIL: combos gravados = % (esperado 4)', n; end if;

  select wallet_balance into w1 from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  if w1 <> w0 - 40 then raise exception 'FAIL: debito dos 4 combos = % (esperado %)', w1, w0 - 40; end if;

  raise notice 'ok: banco pagou 5/10/15/25%% (81.38, 127.88, 267.38, 523.13) e gravou type=multiple';
end $$;

\echo '--- 21. liquidacao com reviewer explicito (caminho da Edge Function)'
reset role;
reset test.local_uid;

insert into public.bets (id, user_id, type, status, selections, total_odds, stake, potential_return)
values ('ffffffff-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'single', 'OPEN', '[]'::jsonb, 2.00, 5, 10),
       ('ffffffff-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        'single', 'OPEN', '[]'::jsonb, 3.00, 4, 12);

set role service_role;
-- Sem test.local_uid: auth.uid() e NULL, como no service_role de verdade.
-- O gate tem que validar o reviewer recebido, nao a sessao.
do $$
declare s numeric; w0 numeric; w1 numeric; b record;
begin
  select wallet_balance into w0 from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';

  select public.settle_bet_atomic('ffffffff-0000-0000-0000-000000000002', 'WON', 10,
         '22222222-2222-2222-2222-222222222222') into s;

  select status, actual_return into b from public.bets
   where id = 'ffffffff-0000-0000-0000-000000000002';
  if b.status <> 'WON' or b.actual_return <> 10 then
    raise exception 'FAIL: liquidacao via reviewer: % / %', b.status, b.actual_return;
  end if;

  select wallet_balance into w1 from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  if w1 <> w0 + 10 then
    raise exception 'FAIL: credito do ganho = % (esperado %)', w1, w0 + 10;
  end if;

  -- Anulacao devolve a stake sem o chamador escolher o valor.
  select public.settle_bet_atomic('ffffffff-0000-0000-0000-000000000003', 'VOID', null,
         '22222222-2222-2222-2222-222222222222') into s;

  select status, actual_return into b from public.bets
   where id = 'ffffffff-0000-0000-0000-000000000003';
  if b.status <> 'VOID' or b.actual_return <> 4 then
    raise exception 'FAIL: anulacao = % / % (esperado VOID / 4)', b.status, b.actual_return;
  end if;

  select wallet_balance into w1 from public.wallet_balances
   where user_id = '11111111-1111-1111-1111-111111111111';
  if w1 <> w0 + 14 then
    raise exception 'FAIL: saldo apos ganho + anulacao = % (esperado %)', w1, w0 + 14;
  end if;

  raise notice 'ok: WON creditou 10 e VOID devolveu a stake de 4 com reviewer explicito';
end $$;

-- Reviewer que nao e admin nao liquida, mesmo com service_role.
do $$
begin
  perform public.settle_bet_atomic('ffffffff-0000-0000-0000-000000000001', 'WON', 100,
         '11111111-1111-1111-1111-111111111111');
  raise exception 'FAIL: reviewer comum liquidou aposta';
exception
  when raise_exception then
    if sqlerrm = 'Acesso restrito a administradores ativos' then
      raise notice 'ok: reviewer nao-admin negado mesmo com service_role';
    else
      raise;
    end if;
end $$;

reset role;
reset test.local_uid;
\echo '=== TODOS OS TESTES PASSARAM ==='
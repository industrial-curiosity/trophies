module trophies::registry;

use std::string::String;
use std::type_name::{Self, TypeName};
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::dynamic_field;
use sui::event;
use sui::object::{Self, UID, ID};
use sui::sui::SUI;
use sui::table::{Self, Table};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

const EUnauthorized: u64 = 0;
const EPaused: u64 = 1;
const EAmount: u64 = 2;
const EAsset: u64 = 3;
const ERecipient: u64 = 4;
const SHARE_UNIT: u128 = 1_000_000_000_000_000_000;
const SCALE: u256 = 1_000_000_000_000_000_000_000_000_000_000_000_000;

public struct Registry has key {
    id: UID,
    owner: address,
    operations_paused: bool,
    withdrawals_paused: bool,
}

public struct Project has key {
    id: UID,
    manager: address,
    registry_id: ID,
    supply: u128,
    manager_paused: bool,
    owner_paused: bool,
    withdrawals_paused: bool,
    rewards: vector<Reward>,
    asset_indexes: Table<TypeName, u64>,
    holders: Table<address, Holder>,
}

public struct Reward has store, drop {
    index: u256,
    received: u128,
    fee_remainder: u64,
}

public struct Holder has store, drop {
    shares: u128,
    accounts: vector<Account>,
}

public struct Account has store, drop {
    checkpoint: u256,
    scaled_credit: u256,
}

public struct AssetKey has copy, drop, store { name: TypeName }
public struct Vault<phantom T> has store { holders: Balance<T>, fees: Balance<T> }

public struct ProjectRegistered has copy, drop { project_id: ID, manager: address }
public struct AssetEnabled has copy, drop { project_id: ID, asset: TypeName }
public struct Generated has copy, drop {
    project_id: ID, description: String, issuer: address, recipient: address,
    quantity: u128, external_reference: String,
}
public struct SharesTransferred has copy, drop {
    project_id: ID, sender: address, recipient: address, quantity: u128,
}
public struct Donated has copy, drop {
    project_id: ID, donor: address, asset: TypeName, gross: u64, fee: u64, net: u64,
}
public struct Claimed has copy, drop {
    project_id: ID, holder: address, asset: TypeName, amount: u64,
}
public struct FeesCollected has copy, drop { project_id: ID, asset: TypeName, amount: u64 }
public struct ManagerPauseChanged has copy, drop { project_id: ID, paused: bool }
public struct OwnerPauseChanged has copy, drop {
    project_id: ID, operations: bool, withdrawals: bool,
}
public struct GlobalPauseChanged has copy, drop { operations: bool, withdrawals: bool }

fun init(ctx: &mut TxContext) {
    transfer::share_object(new_registry(ctx));
}

fun new_registry(ctx: &mut TxContext): Registry {
    Registry { id: object::new(ctx), owner: ctx.sender(), operations_paused: false,
        withdrawals_paused: false }
}

fun new_project(registry: &Registry, ctx: &mut TxContext): Project {
    assert!(!registry.operations_paused, EPaused);
    let mut project = Project {
        id: object::new(ctx), manager: ctx.sender(), registry_id: object::id(registry),
        supply: 0, manager_paused: false, owner_paused: false, withdrawals_paused: false,
        rewards: vector[], asset_indexes: table::new(ctx), holders: table::new(ctx),
    };
    add_asset<SUI>(&mut project);
    event::emit(ProjectRegistered { project_id: object::id(&project), manager: project.manager });
    project
}

public fun create_project(registry: &Registry, ctx: &mut TxContext) {
    transfer::share_object(new_project(registry, ctx));
}

public fun enable_asset<T>(registry: &Registry, project: &mut Project, ctx: &TxContext) {
    assert!(ctx.sender() == project.manager, EUnauthorized);
    require_active(registry, project);
    add_asset<T>(project);
}

fun add_asset<T>(project: &mut Project) {
    let name = type_name::with_defining_ids<T>();
    if (project.asset_indexes.contains(name)) return;
    let index = project.rewards.length();
    project.asset_indexes.add(name, index);
    project.rewards.push_back(Reward { index: 0, received: 0, fee_remainder: 0 });
    dynamic_field::add(&mut project.id, AssetKey { name },
        Vault<T> { holders: balance::zero(), fees: balance::zero() });
    event::emit(AssetEnabled { project_id: object::id(project), asset: name });
}

public fun mint(registry: &Registry, project: &mut Project, recipient: address,
    quantity: u128, description: String, external_reference: String, ctx: &TxContext) {
    assert!(ctx.sender() == project.manager, EUnauthorized);
    require_active(registry, project);
    assert!(quantity > 0, EAmount);
    assert!(recipient != @0x0 && recipient != object::id_address(project), ERecipient);
    settle(project, recipient);
    project.supply = project.supply + quantity;
    let holder = project.holders.borrow_mut(recipient);
    holder.shares = holder.shares + quantity;
    event::emit(Generated { project_id: object::id(project), description,
        issuer: ctx.sender(), recipient, quantity, external_reference });
}

public fun transfer_shares(registry: &Registry, project: &mut Project, recipient: address,
    quantity: u128, ctx: &TxContext) {
    require_active(registry, project);
    assert!(quantity > 0, EAmount);
    assert!(recipient != @0x0 && recipient != object::id_address(project), ERecipient);
    let sender = ctx.sender();
    assert!(project.holders.contains(sender), EAmount);
    assert!(project.holders.borrow(sender).shares >= quantity, EAmount);
    settle(project, sender);
    if (recipient != sender) {
        settle(project, recipient);
        let from = project.holders.borrow_mut(sender);
        from.shares = from.shares - quantity;
        let to = project.holders.borrow_mut(recipient);
        to.shares = to.shares + quantity;
    };
    event::emit(SharesTransferred { project_id: object::id(project), sender, recipient, quantity });
}

public fun donate<T>(registry: &Registry, project: &mut Project, payment: Coin<T>,
    ctx: &TxContext) {
    require_active(registry, project);
    let gross = payment.value();
    assert!(gross > 0 && project.supply > 0, EAmount);
    let name = type_name::with_defining_ids<T>();
    assert!(project.asset_indexes.contains(name), EAsset);
    let index = *project.asset_indexes.borrow(name);
    let reward = &mut project.rewards[index];
    let residue = gross % 200 + reward.fee_remainder;
    let fee = gross / 200 + residue / 200;
    reward.fee_remainder = residue % 200;
    let net = gross - fee;
    reward.received = reward.received + (gross as u128);
    reward.index = reward.index + ((net as u256) * SCALE / (project.supply as u256));
    let vault = dynamic_field::borrow_mut<AssetKey, Vault<T>>(&mut project.id, AssetKey { name });
    let mut funds = payment.into_balance();
    vault.fees.join(funds.split(fee));
    vault.holders.join(funds);
    event::emit(Donated { project_id: object::id(project), donor: ctx.sender(),
        asset: name, gross, fee, net });
}

public fun claim<T>(registry: &Registry, project: &mut Project, ctx: &mut TxContext): u64 {
    require_withdrawals(registry, project);
    let name = type_name::with_defining_ids<T>();
    assert!(project.asset_indexes.contains(name), EAsset);
    let index = *project.asset_indexes.borrow(name);
    let sender = ctx.sender();
    accrue_asset(project, sender, index);
    let account = &mut project.holders.borrow_mut(sender).accounts[index];
    let amount = (account.scaled_credit / SCALE) as u64;
    if (amount == 0) return 0;
    account.scaled_credit = account.scaled_credit % SCALE;
    let vault = dynamic_field::borrow_mut<AssetKey, Vault<T>>(&mut project.id, AssetKey { name });
    let payout = coin::from_balance(vault.holders.split(amount), ctx);
    transfer::public_transfer(payout, sender);
    event::emit(Claimed { project_id: object::id(project), holder: sender, asset: name, amount });
    amount
}

public fun collect_fees<T>(registry: &Registry, project: &mut Project,
    ctx: &mut TxContext): u64 {
    assert!(ctx.sender() == registry.owner, EUnauthorized);
    require_withdrawals(registry, project);
    let name = type_name::with_defining_ids<T>();
    assert!(project.asset_indexes.contains(name), EAsset);
    let vault = dynamic_field::borrow_mut<AssetKey, Vault<T>>(&mut project.id, AssetKey { name });
    let amount = vault.fees.value();
    if (amount == 0) return 0;
    transfer::public_transfer(coin::from_balance(vault.fees.split(amount), ctx), registry.owner);
    event::emit(FeesCollected { project_id: object::id(project), asset: name, amount });
    amount
}

fun ensure_holder(project: &mut Project, holder: address) {
    if (!project.holders.contains(holder)) {
        project.holders.add(holder, Holder { shares: 0, accounts: vector[] });
    };
    let accounts = &mut project.holders.borrow_mut(holder).accounts;
    while (accounts.length() < project.rewards.length()) {
        accounts.push_back(Account { checkpoint: 0, scaled_credit: 0 });
    };
}

fun accrue_asset(project: &mut Project, holder: address, index: u64) {
    ensure_holder(project, holder);
    let reward_index = project.rewards[index].index;
    let h = project.holders.borrow_mut(holder);
    let a = &mut h.accounts[index];
    a.scaled_credit = a.scaled_credit + ((h.shares as u256) * (reward_index - a.checkpoint));
    a.checkpoint = reward_index;
}

fun settle(project: &mut Project, holder: address) {
    ensure_holder(project, holder);
    let mut i = 0;
    while (i < project.rewards.length()) { accrue_asset(project, holder, i); i = i + 1; };
}

public fun set_manager_pause(project: &mut Project, paused: bool, ctx: &TxContext) {
    assert!(ctx.sender() == project.manager, EUnauthorized);
    project.manager_paused = paused;
    event::emit(ManagerPauseChanged { project_id: object::id(project), paused });
}

public fun set_owner_pause(registry: &Registry, project: &mut Project,
    operations: bool, withdrawals: bool, ctx: &TxContext) {
    require_registry(registry, project);
    assert!(ctx.sender() == registry.owner, EUnauthorized);
    project.owner_paused = operations;
    project.withdrawals_paused = withdrawals;
    event::emit(OwnerPauseChanged { project_id: object::id(project), operations, withdrawals });
}

public fun set_global_pause(registry: &mut Registry, operations: bool, withdrawals: bool,
    ctx: &TxContext) {
    assert!(ctx.sender() == registry.owner, EUnauthorized);
    registry.operations_paused = operations;
    registry.withdrawals_paused = withdrawals;
    event::emit(GlobalPauseChanged { operations, withdrawals });
}

fun require_registry(registry: &Registry, project: &Project) {
    assert!(object::id(registry) == project.registry_id, EUnauthorized);
}
fun require_active(registry: &Registry, project: &Project) {
    require_registry(registry, project);
    assert!(!registry.operations_paused && !project.owner_paused && !project.manager_paused, EPaused);
}
fun require_withdrawals(registry: &Registry, project: &Project) {
    require_registry(registry, project);
    assert!(!registry.withdrawals_paused && !project.withdrawals_paused, EPaused);
}

public fun share_unit(): u128 { SHARE_UNIT }
public fun total_supply(project: &Project): u128 { project.supply }
public fun balance_of(project: &Project, holder: address): u128 {
    if (project.holders.contains(holder)) project.holders.borrow(holder).shares else 0
}
public fun entitlement<T>(project: &Project, holder: address): (u256, u256) {
    let name = type_name::with_defining_ids<T>();
    assert!(project.asset_indexes.contains(name), EAsset);
    if (!project.holders.contains(holder)) return (0, 0);
    let index = *project.asset_indexes.borrow(name);
    let h = project.holders.borrow(holder);
    let (checkpoint, credit) = if (index < h.accounts.length()) {
        let a = &h.accounts[index]; (a.checkpoint, a.scaled_credit)
    } else (0, 0);
    let scaled = credit + (h.shares as u256) * (project.rewards[index].index - checkpoint);
    (scaled / SCALE, scaled % SCALE)
}

#[test_only]
public fun new_registry_for_testing(ctx: &mut TxContext): Registry { new_registry(ctx) }

#[test_only]
public fun share_registry_for_testing(registry: Registry) { transfer::share_object(registry); }
#[test_only]
public fun share_project_for_testing(project: Project) { transfer::share_object(project); }

#[test]
fun generation_metadata_is_recorded() {
    let mut ctx = tx_context::dummy();
    let registry = new_registry(&mut ctx);
    let mut project = new_project(&registry, &mut ctx);
    mint(&registry, &mut project, @0xa, SHARE_UNIT / 2,
        std::string::utf8(b"contribution"), std::string::utf8(b"reference"), &ctx);
    let records = event::events_by_type<Generated>();
    assert!(records.length() == 1);
    let record = &records[0];
    assert!(record.description == std::string::utf8(b"contribution"));
    assert!(record.external_reference == std::string::utf8(b"reference"));
    assert!(record.issuer == ctx.sender() && record.recipient == @0xa);
    assert!(record.quantity == SHARE_UNIT / 2 && record.project_id == object::id(&project));
    transfer::share_object(project); transfer::share_object(registry);
}

#[test_only]
public fun new_project_for_testing(registry: &Registry, ctx: &mut TxContext): Project { new_project(registry, ctx) }

#[test_only]
module trophies::registry_tests;

use std::string;
use sui::coin;
use sui::object;
use sui::sui::SUI;
use sui::test_scenario;
use trophies::registry;

const OWNER: address = @0xfee;
const MANAGER: address = @0x111;
const ALICE: address = @0xa;
const BOB: address = @0xb;
const UNIT: u128 = 1_000_000_000_000_000_000;

public struct TEST has drop {}

fun assert_entitlement<T>(p: &registry::Project, holder: address, expected: u256) {
    let (amount, remainder) = registry::entitlement<T>(p, holder);
    assert!(amount == expected && remainder == 0);
}

#[test]
fun earnings_survive_full_transfer_and_later_donations() {
    let mut scenario = test_scenario::begin(OWNER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    registry::share_registry_for_testing(r);
    scenario.next_tx(MANAGER);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b"work"), string::utf8(b"ref"), scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(20_000, scenario.ctx()), scenario.ctx());
    registry::share_project_for_testing(p);
    test_scenario::return_shared(r);
    scenario.next_tx(ALICE);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = scenario.take_shared<registry::Project>();
    registry::transfer_shares(&r, &mut p, BOB, UNIT, scenario.ctx());
    assert!(registry::balance_of(&p, ALICE) == 0);
    assert!(registry::balance_of(&p, BOB) == UNIT);
    assert_entitlement<SUI>(&p, ALICE, 19_900);
    assert_entitlement<SUI>(&p, BOB, 0);
    assert!(registry::claim<SUI>(&r, &mut p, scenario.ctx()) == 19_900);
    test_scenario::return_shared(p);
    test_scenario::return_shared(r);
    scenario.next_tx(MANAGER);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = scenario.take_shared<registry::Project>();
    registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(20_000, scenario.ctx()), scenario.ctx());
    assert_entitlement<SUI>(&p, ALICE, 0);
    assert_entitlement<SUI>(&p, BOB, 19_900);
    assert!(registry::total_supply(&p) == UNIT);
    test_scenario::return_shared(p);
    test_scenario::return_shared(r);
    scenario.end();
}

#[test]
fun new_shares_do_not_receive_past_donations() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(20_000, scenario.ctx()), scenario.ctx());
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::mint(&r, &mut p, BOB, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    assert_entitlement<SUI>(&p, ALICE, 19_900);
    assert_entitlement<SUI>(&p, BOB, 0);
    registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(60_000, scenario.ctx()), scenario.ctx());
    assert_entitlement<SUI>(&p, ALICE, 59_700);
    assert_entitlement<SUI>(&p, BOB, 19_900);
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r); scenario.end();
}

#[test]
fun multiple_assets_and_manager_pause_preserve_claims() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::enable_asset<TEST>(&r, &mut p, scenario.ctx());
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(20_000, scenario.ctx()), scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<TEST>(40_000, scenario.ctx()), scenario.ctx());
    registry::set_manager_pause(&mut p, true, scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r);
    scenario.next_tx(ALICE);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = scenario.take_shared<registry::Project>();
    assert!(registry::claim<SUI>(&r, &mut p, scenario.ctx()) == 19_900);
    assert!(registry::claim<TEST>(&r, &mut p, scenario.ctx()) == 39_800);
    test_scenario::return_shared(p); test_scenario::return_shared(r); scenario.end();
}

#[test]
fun fee_remainder_and_owner_collection() {
    let mut scenario = test_scenario::begin(OWNER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    registry::share_registry_for_testing(r);
    scenario.next_tx(MANAGER);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(199, scenario.ctx()), scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(1, scenario.ctx()), scenario.ctx());
    assert_entitlement<SUI>(&p, ALICE, 199);
    registry::share_project_for_testing(p); test_scenario::return_shared(r);
    scenario.next_tx(OWNER);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = scenario.take_shared<registry::Project>();
    assert!(registry::collect_fees<SUI>(&r, &mut p, scenario.ctx()) == 1);
    assert!(registry::collect_fees<SUI>(&r, &mut p, scenario.ctx()) == 0);
    test_scenario::return_shared(p); test_scenario::return_shared(r); scenario.end();
}

#[test]
#[expected_failure(abort_code = 0, location = trophies::registry)]
fun unauthorized_mint_fails() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r);
    scenario.next_tx(ALICE);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = scenario.take_shared<registry::Project>();
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    test_scenario::return_shared(p); test_scenario::return_shared(r); scenario.end();
}

#[test]
#[expected_failure(abort_code = 1, location = trophies::registry)]
fun owner_can_pause_withdrawals() {
    let mut scenario = test_scenario::begin(OWNER);
    let mut r = registry::new_registry_for_testing(scenario.ctx());
    registry::set_global_pause(&mut r, false, true, scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, OWNER, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(20_000, scenario.ctx()), scenario.ctx());
    registry::claim<SUI>(&r, &mut p, scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r); scenario.end();
}

#[test]
#[expected_failure(abort_code = 1, location = trophies::registry)]
fun manager_pause_blocks_transfer() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, MANAGER, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::set_manager_pause(&mut p, true, scenario.ctx());
    registry::transfer_shares(&r, &mut p, BOB, UNIT, scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r); scenario.end();
}

#[test]
#[expected_failure(abort_code = 0, location = trophies::registry)]
fun project_cannot_use_another_registry() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let other = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&other, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r); registry::share_registry_for_testing(other); scenario.end();
}

#[test]
fun fractional_transfer_self_transfer_and_dust() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::mint(&r, &mut p, BOB, 2 * UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(1, scenario.ctx()), scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r);
    scenario.next_tx(ALICE);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = scenario.take_shared<registry::Project>();
    let (before, fractional) = registry::entitlement<SUI>(&p, ALICE);
    assert!(before == 0 && fractional > 0);
    assert!(registry::claim<SUI>(&r, &mut p, scenario.ctx()) == 0);
    registry::transfer_shares(&r, &mut p, ALICE, UNIT / 2, scenario.ctx());
    let (after, remainder) = registry::entitlement<SUI>(&p, ALICE);
    assert!(after == before && remainder == fractional);
    registry::transfer_shares(&r, &mut p, BOB, UNIT / 2, scenario.ctx());
    assert!(registry::balance_of(&p, ALICE) == UNIT / 2);
    assert!(registry::balance_of(&p, BOB) == 5 * UNIT / 2);
    let (_, retained) = registry::entitlement<SUI>(&p, ALICE);
    assert!(retained == fractional);
    test_scenario::return_shared(p); test_scenario::return_shared(r); scenario.end();
}

#[test]
fun project_isolation_and_conservation_sequence() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    let mut other = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::mint(&r, &mut other, BOB, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    let mut donated: u64 = 0;
    let mut i: u64 = 1;
    while (i <= 100) {
        let amount = i * 137;
        donated = donated + amount;
        registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(amount, scenario.ctx()), scenario.ctx());
        i = i + 1;
    };
    registry::donate(&r, &mut other, coin::mint_for_testing<SUI>(20_000, scenario.ctx()), scenario.ctx());
    let expected_fee = donated / 200;
    let (whole, remainder) = registry::entitlement<SUI>(&p, ALICE);
    assert!(whole == (donated - expected_fee) as u256 && remainder == 0);
    assert_entitlement<SUI>(&p, BOB, 0);
    assert_entitlement<SUI>(&other, ALICE, 0);
    assert_entitlement<SUI>(&other, BOB, 19_900);
    assert!(registry::collect_fees<SUI>(&r, &mut p, scenario.ctx()) == expected_fee);
    let project_id = object::id(&p);
    registry::share_project_for_testing(p); registry::share_project_for_testing(other);
    registry::share_registry_for_testing(r);
    scenario.next_tx(ALICE);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = scenario.take_shared_by_id<registry::Project>(project_id);
    assert!(object::id(&p) == project_id);
    assert!(registry::claim<SUI>(&r, &mut p, scenario.ctx()) + expected_fee == donated);
    assert!(registry::claim<SUI>(&r, &mut p, scenario.ctx()) == 0);
    test_scenario::return_shared(p); test_scenario::return_shared(r);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = 2, location = trophies::registry)]
fun zero_supply_donation_fails() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(1, scenario.ctx()), scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r); scenario.end();
}

#[test]
#[expected_failure(abort_code = 3, location = trophies::registry)]
fun unregistered_asset_fails() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<TEST>(1, scenario.ctx()), scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r); scenario.end();
}

#[test]
fun owner_pause_precedence_and_unpause_preserve_credits() {
    let mut scenario = test_scenario::begin(OWNER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    registry::share_registry_for_testing(r);
    scenario.next_tx(MANAGER);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(20_000, scenario.ctx()), scenario.ctx());
    registry::set_manager_pause(&mut p, true, scenario.ctx());
    registry::share_project_for_testing(p); test_scenario::return_shared(r);
    scenario.next_tx(OWNER);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = scenario.take_shared<registry::Project>();
    registry::set_owner_pause(&r, &mut p, true, true, scenario.ctx());
    assert_entitlement<SUI>(&p, ALICE, 19_900);
    registry::set_owner_pause(&r, &mut p, false, false, scenario.ctx());
    test_scenario::return_shared(p); test_scenario::return_shared(r);
    scenario.next_tx(ALICE);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = scenario.take_shared<registry::Project>();
    assert!(registry::claim<SUI>(&r, &mut p, scenario.ctx()) == 19_900);
    assert!(registry::claim<SUI>(&r, &mut p, scenario.ctx()) == 0);
    test_scenario::return_shared(p); test_scenario::return_shared(r); scenario.end();
}

#[test]
#[expected_failure(abort_code = 0, location = trophies::registry)]
fun manager_cannot_change_owner_pause() {
    let mut scenario = test_scenario::begin(OWNER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    registry::share_registry_for_testing(r);
    scenario.next_tx(MANAGER);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::set_owner_pause(&r, &mut p, false, false, scenario.ctx());
    registry::share_project_for_testing(p); test_scenario::return_shared(r); scenario.end();
}

#[test]
#[expected_failure(abort_code = 4, location = trophies::registry)]
fun transfer_to_zero_fails() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, MANAGER, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::transfer_shares(&r, &mut p, @0x0, UNIT, scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r); scenario.end();
}

#[test]
fun deterministic_adversarial_sequence() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::mint(&r, &mut p, BOB, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r);
    let mut round: u64 = 1;
    let mut paid: u64 = 0;
    let mut gross: u64 = 0;
    while (round <= 20) {
        scenario.next_tx(MANAGER);
        let r = scenario.take_shared<registry::Registry>();
        let mut p = scenario.take_shared<registry::Project>();
        let donation = round * 1001;
        gross = gross + donation;
        registry::donate(&r, &mut p, coin::mint_for_testing<SUI>(donation, scenario.ctx()), scenario.ctx());
        test_scenario::return_shared(p); test_scenario::return_shared(r);
        scenario.next_tx(ALICE);
        let r = scenario.take_shared<registry::Registry>();
        let mut p = scenario.take_shared<registry::Project>();
        let fraction = (round as u128) * UNIT / 100;
        registry::transfer_shares(&r, &mut p, BOB, fraction, scenario.ctx());
        paid = paid + registry::claim<SUI>(&r, &mut p, scenario.ctx());
        assert!(registry::total_supply(&p) == 2 * UNIT);
        test_scenario::return_shared(p); test_scenario::return_shared(r);
        scenario.next_tx(BOB);
        let r = scenario.take_shared<registry::Registry>();
        let mut p = scenario.take_shared<registry::Project>();
        registry::transfer_shares(&r, &mut p, ALICE, fraction, scenario.ctx());
        paid = paid + registry::claim<SUI>(&r, &mut p, scenario.ctx());
        assert!(registry::balance_of(&p, ALICE) == UNIT && registry::balance_of(&p, BOB) == UNIT);
        assert!(paid <= gross - gross / 200);
        test_scenario::return_shared(p); test_scenario::return_shared(r);
        round = round + 1;
    };
    scenario.next_tx(MANAGER);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = scenario.take_shared<registry::Project>();
    let fees = registry::collect_fees<SUI>(&r, &mut p, scenario.ctx());
    assert!(fees == gross / 200);
    assert!(gross - fees - paid < 2);
    test_scenario::return_shared(p); test_scenario::return_shared(r); scenario.end();
}

#[test]
#[expected_failure(arithmetic_error, location = trophies::registry)]
fun arithmetic_supply_bound_fails_without_wrapping() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, ALICE, 340282366920938463463374607431768211455,
        string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::mint(&r, &mut p, BOB, 1, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r); scenario.end();
}

#[test]
fun late_asset_registration_preserves_earnings() {
    let mut scenario = test_scenario::begin(MANAGER);
    let r = registry::new_registry_for_testing(scenario.ctx());
    let mut p = registry::new_project_for_testing(&r, scenario.ctx());
    registry::mint(&r, &mut p, ALICE, UNIT, string::utf8(b""), string::utf8(b""), scenario.ctx());
    registry::enable_asset<TEST>(&r, &mut p, scenario.ctx());
    registry::donate(&r, &mut p, coin::mint_for_testing<TEST>(20_000, scenario.ctx()), scenario.ctx());
    registry::share_project_for_testing(p); registry::share_registry_for_testing(r);
    scenario.next_tx(ALICE);
    let r = scenario.take_shared<registry::Registry>();
    let mut p = scenario.take_shared<registry::Project>();
    registry::transfer_shares(&r, &mut p, BOB, UNIT, scenario.ctx());
    let (whole, remainder) = registry::entitlement<TEST>(&p, ALICE);
    assert!(whole == 19_900 && remainder == 0);
    let (whole, remainder) = registry::entitlement<TEST>(&p, BOB);
    assert!(whole == 0 && remainder == 0);
    assert!(registry::claim<TEST>(&r, &mut p, scenario.ctx()) == 19_900);
    test_scenario::return_shared(p); test_scenario::return_shared(r); scenario.end();
}

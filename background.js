
async function getData() {
    async function getToken() {
        const auth = await fetch(
            "https://auth-service.dndbeyond.com/v1/cobalt-token",
            { method: "POST", credentials: "include" })
            .then((response) => response.json());
        console.log(auth);
        const token = auth.token;
        return token;
    }

    function summon(input, token, init) {
        return fetch(input, {
            ...init,
            credentials: 'omit',
            headers: {
                Authorization: "Bearer " + token,
                Accept: "application/json",
            },
        }).then((response) => response.json());
    }

    function modifierForAbilityScore(score) {
        return Math.round((score - 10) / 2);
    }

    const campaign = (await chrome.storage.local.get('dnd_beyond_inventory_campaign')).dnd_beyond_inventory_campaign;

    try {
        const token = await getToken();
        const characterSummary = await summon(
            "https://api.dndbeyond.com/campaigns/v1/" + campaign + "/characters",
            token,
        );
        console.log(characterSummary);

        const allCharacters = characterSummary.data.map((character) => {
            const name = character.name;
            const id = character.id;
            return summon(
                "https://character-service.dndbeyond.com/character/v5/character/" + id + "?includeCustomItems=true",
                token,
            );
        });
        const characters = await Promise.all(allCharacters);
        var defaultSlots = [];
        const knownSingleSlot = new Set([
            "Bedroll",
            "Waterskin",
            "Bagpipes",
            "Rope",
            "Blanket",
            "Tinderbox",
            "Book",
            "Lantern",
            "Hooded Lantern",
            "Hunting Trap",
            "Worn Fiddle",
            "Carpenter's Tools",
            "Herbalism Kit",
            "Grappling Hook",
            "Healer's Kit",
            "Calligrapher's Supplies",
            "Jeweler's Tools",
            "Traveler's Clothes",
            "Robe",
            "Fine Clothes",
        ]);
        const knownDoubleSlot = new Set([
            "Tent",
        ])
        const knownSimpleBundle = new Set([
            "Torch",
            "Rations",
            "Oil",
            "Holy Water",
        ]);
        const knownZeroEquipped = new Set([
            "Traveler's Clothes",
            "Robe",
            "Fine Clothes",
        ]);
        const knownTinySlot = new Set([
            "Mirror",
        ]);
        const data = characters.map((c) => {
            console.log(c.data);
            const overrideStr = c.data.overrideStats.find((s) => s.id === 1);
            const baseStr = c.data.stats.find((s) => s.id === 1);
            const bonusStr = c.data.bonusStats.find((s) => s.id === 1);
            const raceStr = c.data.modifiers.race.find((r) => r.type === "bonus" && r.subType == "strength-score");
            var str = baseStr.value;
            if (overrideStr.value) {
                str = overrideStr.value;
            } else {
                if (bonusStr.value) {
                    str += bonusStr.value
                }
                if (raceStr && raceStr.value) {
                    str += raceStr.value
                }
            }
            var items = c.data.inventory.map((item) => {
                const def = item.definition;
                var itemSlots = 1;
                var itemBundleType, itemBundleCount;
                if (knownZeroEquipped.has(def.name) && item.equipped) {
                    itemSlots = 0;
                } else if (knownSingleSlot.has(def.name)) {
                } else if (knownDoubleSlot.has(def.name)) {
                    itemSlots = 2;
                } else if (knownTinySlot.has(def.name)) {
                    itemSlots = 0
                } else if (knownSimpleBundle.has(def.name)) {
                    itemBundleCount = 3;
                    itemBundleType = def.name;
                } else if (def.armorTypeId === 3) {
                    itemSlots = 2;
                } else if (def.filterType === "Armor") {
                } else if (def.filterType === "Weapon" && def.weight <= 10) {
                } else if (def.properties && def.properties.find((p) => p.name === "Two-Handed")) {
                    itemSlots = 2;
                } else if (def.filterType === "Potion" || def.subType === "Potion") {
                    itemBundleType = "Potion";
                    itemBundleCount = 3;
                } else if (def.isContainer) {
                    if (item.equipped) {
                        itemSlots = 0;
                    }
                } else if (def.bundleSize > 1 && def.weight < 10) {
                    itemSlots = 1;
                    itemBundleType = def.name;
                    itemBundleCount = def.bundleSize;
                } else if (def.weight <= 0.01 && item.quantity < 100) {
                    itemSlots = 0;
                } else if (def.weight > 10) {
                    itemSlots = 2;
                    defaultSlots.push(item.definition);
                } else {
                    defaultSlots.push(item.definition);
                }
                return {
                    name: item.definition.name,
                    containerId: item.containerEntityId,
                    quantity: item.quantity,
                    equipped: item.equipped,
                    itemWeight: item.definition.weight / (item.definition.bundleSize || 1),
                    itemCost: item.definition.cost / (item.definition.bundleSize || 1),
                    itemSlots: itemSlots,
                    itemBundleType: itemBundleType,
                    itemBundleCount: itemBundleCount,
                }
            })

            // special case partial bundles
            const oil = items.find((item) => item.name === "Oil");
            const lantern = items.find((item) => item.name === "Lantern" || item.name == "Hooded Lantern");
            if (oil && lantern) {
                const fullLanterns = Math.max(lantern.quantity, Math.floor(oil.quantity / 2))
                if (fullLanterns > 0) {
                    var fullLantern = structuredClone(lantern);
                    fullLantern.name += " *(2 flasks of oil)*";
                    fullLantern.itemWeight += oil.itemWeight * 2;
                    items.push(fullLantern)
                    oil.quantity -= fullLanterns * 2;
                    lantern.quantity -= fullLanterns;
                }
                if (oil.quantity > 0 && lantern.quantity > 0) {
                    var partialLantern = structuredClone(lantern);
                    partialLantern.name += " *(1 flask of oil)*";
                    partialLantern.itemWeight += oil.itemWeight * 2;
                    items.push(partialLantern)
                    oil.quantity -= 1;
                    lantern.quantity -= 1;
                }
            }

            // merge bundled items that have the same name, weight, and bundle count
            var bundleTypes = new Map();
            items.forEach((item, idx) => {
                if (!item.itemBundleType) { return; }
                if (!bundleTypes.has(item.name)) { bundleTypes.set(item.name, []) }
                bundleTypes.get(item.name).push(idx);
            });
            bundleTypes.forEach((indices) => {
                if (indices.length < 2) {
                    return;
                }
                const item = items[indices[0]];
                console.log("test merge of "+item.name+" from "+c.data.name+" at position "+indices[0] + " with length "+indices.length);
                for (var i = 1; i < indices.length; i++) {
                    const other = items[indices[i]];
                    if (item.itemBundleType === other.itemBundleType &&
                        item.equipped === other.equipped && 
                        item.itemBundleCount === other.itemBundleCount && 
                        item.itemWeight === other.itemWeight &&
                        item.containerId === other.containerId
                    ) {
                        console.log("merge item "+item.name+" at "+indices[i]+" to "+indices[0]);
                        item.quantity += other.quantity;
                        items[indices[i]] = null
                    } else {
                        console.log("skip merge item "+item.name+" at "+indices[i]+" to "+indices[0]);
                    }
                }
            })
            items = items.filter((item) => !!item);

            const coins = c.data.currencies.pp + c.data.currencies.ep + c.data.currencies.gp + c.data.currencies.sp + c.data.currencies.cp;
            const coinValue = c.data.currencies.gp + c.data.currencies.cp / 100 + c.data.currencies.sp / 10 + c.data.currencies.ep * 2 + c.data.currencies.pp * 10;
            if (coins > 0) {
                items.push({
                    name: "Coins",
                    quantity: coins,
                    itemWeight: 0.01,
                    itemBundleCount: 500,
                    itemBundleType: "Coins",
                    itemCost: -coinValue / coins,
                })
            }

            items = items.filter((item) => item.quantity > 0).sort((a, b) => {
                const slots = b.itemSlots - a.itemSlots;
                if (slots !== 0) { return slots; }
                const weight = b.itemWeight - a.itemWeight;
                if (weight !== 0) { return weight; }
                const quantity = b.quantity - a.quantity;
                if (quantity !== 0) { return quantity; }
                const cost = b.itemCost - a.itemCost;
                return cost;
            });
            return {
                name: c.data.name,
                strength: str,
                extraSlots: modifierForAbilityScore(str),
                gold: coinValue,
                items: items,
                totalWeight: items.map((item) => item.quantity * item.itemWeight).reduce((a, b) => a + b, 0),
                totalCost: items.map((item) => item.quantity * Math.max(item.itemCost, 0)).reduce((a, b) => a + b, 0),
            }
        });

        console.log(data);
        console.log(defaultSlots.map((def) => { return { name: def.name, weight: def.weight, def: def } }));

        console.log(data.map((c) => [
            c.name,
            c.gold,
            c.items.map((a) => a.itemCost > 0 && a.quantity * a.itemCost).reduce((a, b) => a + b, 0),
            c.items.map((a) => a.quantity * a.itemWeight).reduce((a, b) => a + b, 0),
            c.items.filter((a) => a.equipped).map((b) => {
                if (b.itemBundleCount > 0) {
                    return Math.ceil(b.quantity / b.itemBundleCount);
                }
                return b.quantity * b.itemSlots;
            }).reduce((a, b) => a + b, 0),
            c.items.filter((a) => !a.equipped).map((b) => {
                if (b.itemBundleCount > 0) {
                    return Math.ceil(b.quantity / b.itemBundleCount);
                }
                return b.quantity * b.itemSlots;
            }).reduce((a, b) => a + b, 0),
        ]));

        const tables = data.map((c) => {
            var packed = [], equipped = [];
            c.items.filter((item) => item.itemSlots > 0).forEach((item) => {
                const rows = item.equipped ? equipped : packed;
                if (item.itemBundleCount > 1) {
                    // create one row per full itemBundleCount, then remainder
                    const remainder = item.quantity % item.itemBundleCount;
                    for (var i = 0; i < Math.floor(item.quantity / item.itemBundleCount); i++) {
                        rows.push(item.name + " *(" + item.itemBundleCount + ")*");
                    }
                    if (remainder > 0) {
                        rows.push(item.name + " *(" + remainder + ")*");
                    }
                } else {
                    // occupy all slots per item
                    for (var i = 0; i < item.quantity; i++) {
                        for (var j = 0; j < item.itemSlots; j++) {
                            if (item.itemSlots > 1) {
                                rows.push(item.name + " *(" + (j + 1) + " of " + item.itemSlots + ")*");
                            } else {
                                rows.push(item.name);
                            }
                        }
                    }
                }
            })

            var unencumberingPacked = [], unencumberingEquipped = []
            c.items.filter((item) => item.itemSlots === 0).forEach((item) => {
                const rows = item.equipped ? unencumberingEquipped : unencumberingPacked;
                rows.push(item.name + " *(" + item.quantity + ")*");
            });

            var outputPacked = [];
            var bonusPacked = [];
            const maxPacked = 16 + c.extraSlots
            if (c.extraSlots > 0) {
                bonusPacked = packed.splice(0, c.extraSlots);
                outputPacked = packed.splice(0, 16);
            } else {
                outputPacked = packed.splice(0, 16 + c.extraSlots);
            }
            const outputEquipped = equipped.splice(0, 9);

            var aligned = new Array(maxPacked);
            const equippedOffset = maxPacked - 9 - 1
            for (var i = 0; i < aligned.length; i++) {
                aligned[i] = new Array(5);
                if (i - 1 < outputPacked.length) {
                    aligned[i][3] = outputPacked[i];
                }
                if (i > equippedOffset) {
                    aligned[i][2] = (i - equippedOffset).toString();
                }
                aligned[i][4] = (i + 1).toString();
            }
            for (var i = 0; i < outputEquipped.length; i++) {
                aligned[equippedOffset + 1 + i][0] = outputEquipped[i];
            }

            aligned.unshift(
                ["**Equipped Items**", null, null, "**Packed Items**", null],
                Array(5).fill("---"),
            );

            return aligned.map((r) => "| " + r.join(" | ") + " |").join("\n");
        });

        console.log(tables);

        return "|Bruce|\n|Stuff|\n"
    } catch (error) {
        console.error(error);
    }
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({
        text: "OFF",
    });
});

chrome.action.onClicked.addListener(async (tab) => {
    chrome.storage.local.remove('dnd_beyond_inventory_campaign');
    if (!tab.url) {
        console.log("Not a web page");
        chrome.action.setPopup({ popup: '' });
        await chrome.action.setBadgeText({
            tabId: tab.id,
            text: "OFF",
        });
        return;
    }
    const url_re = new RegExp("^https://www\\.dndbeyond\\.com/campaigns/(\\d+)$");
    const campaigns = tab.url.match(url_re);
    if (!campaigns) {
        console.log("Not campaign: " + tab.url);
        chrome.action.setPopup({ popup: '' });
        await chrome.action.setBadgeText({
            tabId: tab.id,
            text: "OFF",
        });
        return;
    }
    const campaign = campaigns[1]
    console.log("found campaign " + campaign);

    // Set the action badge to the next state
    await chrome.action.setBadgeText({
        tabId: tab.id,
        text: "...",
    });

    try {
        chrome.storage.local.set({ dnd_beyond_inventory_campaign: campaign })
        const result = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: getData,
        });
        console.log("executeScript completed")
        console.log(result[0].result);
        const data = result[0].result;

        chrome.action.setBadgeText({
            tabId: tab.id,
            text: "ON",
        });
        //chrome.action.setPopup({tabId: tab.id, popup: "data.html"});
        //await chrome.action.openPopup();
    } catch (error) {
        console.error(error);
        await chrome.action.setBadgeText({
            tabId: tab.id,
            text: "ERR",
        });
    }
});

//         "default_popup": "index.html"
/*
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  var currTab = tabs[0];
  if (currTab) { // Sanity check
   
  }
});
*/
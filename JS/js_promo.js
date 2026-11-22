 const PromoEngine = {
    /**
     * Menghitung diskon item & mendeteksi kelayakan Tebus Murah (PWP) secara instan (< 5ms)[cite: 1, 2]
     */
    evaluateCart: function(cartItems, activePromos) {
      let subtotal = 0;
      let totalDiscount = 0;
      const appliedPromos = [];
      const pwpOffers = [];

      // Reset diskon per item terlebih dahulu
      cartItems.forEach(item => {
        item.discount = 0;
        item.promoLabel = '';
        subtotal += item.price * item.qty;
      });

      // 1. Evaluasi Diskon Reguler, Harga Bertingkat (Tiered), dan Bundling[cite: 2]
      activePromos.forEach(promo => {
        if (promo.promo_type === 'DISCOUNT') {
          const item = cartItems.find(c => c.barcode === promo.target_barcode);
          if (item && item.qty >= promo.min_qty) {
            const discPerUnit = Math.max(0, item.price - promo.promo_price);
            item.discount += discPerUnit * item.qty;
            item.promoLabel = 'Diskon Promo';
            totalDiscount += item.discount;
            appliedPromos.push({ id: promo.promo_id, type: 'DISCOUNT', amount: item.discount });
          }
        } 
        else if (promo.promo_type === 'TIERED') {
          // Harga Grosir / Bertingkat berdasarkan jumlah beli[cite: 2]
          const item = cartItems.find(c => c.barcode === promo.target_barcode);
          if (item && item.qty >= promo.min_qty) {
            const discPerUnit = Math.max(0, item.price - promo.promo_price);
            item.discount += discPerUnit * item.qty;
            item.promoLabel = `Grosir ≥${promo.min_qty}`;
            totalDiscount += item.discount;
            appliedPromos.push({ id: promo.promo_id, type: 'TIERED', amount: item.discount });
          }
        }
        else if (promo.promo_type === 'BUNDLING') {
          // Mix & Match: Barcode syarat + Barcode pasangan[cite: 2]
          const itemA = cartItems.find(c => c.barcode === promo.target_barcode);
          const itemB = cartItems.find(c => c.barcode === promo.reward_barcode);
          if (itemA && itemB) {
            const bundlePairs = Math.min(itemA.qty, itemB.qty);
            const normalBundlePrice = itemA.price + itemB.price;
            const bundleDiscount = Math.max(0, (normalBundlePrice - promo.promo_price) * bundlePairs);
            if (bundleDiscount > 0) {
              itemB.discount += bundleDiscount;
              itemB.promoLabel = 'Paket Bundling';
              totalDiscount += bundleDiscount;
              appliedPromos.push({ id: promo.promo_id, type: 'BUNDLING', amount: bundleDiscount });
            }
          }
        }
      });

      const netAfterItemPromo = subtotal - totalDiscount;

      // 2. Evaluasi PWP (Purchase With Purchase / Tebus Murah)[cite: 2]
      activePromos.forEach(promo => {
        if (promo.promo_type === 'PWP') {
          // Syarat minimum belanja terpenuhi (min_qty dipakai sebagai batas min_spend jika > 100)
          const minSpend = promo.min_qty > 100 ? promo.min_qty : 50000;
          if (netAfterItemPromo >= minSpend) {
            const rewardInCart = cartItems.find(c => c.barcode === promo.reward_barcode);
            if (rewardInCart) {
              // Terapkan harga tebus murah untuk maksimal 1 pcs item tebusan
              const pwpDisc = Math.max(0, rewardInCart.price - promo.promo_price);
              rewardInCart.discount += pwpDisc;
              rewardInCart.promoLabel = 'Tebus Murah PWP';
              totalDiscount += pwpDisc;
              appliedPromos.push({ id: promo.promo_id, type: 'PWP', amount: pwpDisc });
            } else {
              // Tampilkan notifikasi penawaran PWP ke kasir[cite: 2]
              pwpOffers.push(promo);
            }
          }
        }
      });

      return {
        subtotal,
        totalDiscount,
        grandTotal: Math.max(0, subtotal - totalDiscount),
        appliedPromos,
        pwpOffers
      };
    }
  };

import { FoodItem, MealDraftInput } from './macroquest.models';

const friendSource = 'Mock data';

function food(
  name: string,
  servingLabel: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  confidence: number,
  servings = 1,
): FoodItem {
  return {
    id: '',
    name,
    servingLabel,
    servings,
    calories,
    protein,
    carbs,
    fat,
    confidence,
  };
}

export interface FriendDayLog {
  /** 0 is today. Negative offsets are earlier days. */
  readonly dayOffset: number;
  readonly meals: readonly MealDraftInput[];
}

/**
 * One mock day from a Billa shopper.
 * Packaged foods use the label for the amount eaten. Breakfast amounts are the
 * usual portion: 40 g oats (half a bowl), 10 g honey, 150 ml milk, and 150 g skyr.
 */
export function createFriendDay(): MealDraftInput[] {
  return [
    {
      title: 'Oatmeal',
      source: friendSource,
      notes: 'Half a bowl of oatmeal, with a little honey, milk, and skyr.',
      items: [
        food(
          'Ja! Natürlich rolled oats',
          '40 g, half a bowl',
          149,
          6,
          24,
          3,
          0.74,
        ),
        food('Honey', '10 g, a little', 30, 0, 8, 0, 0.7),
        food('Milk', '150 ml', 96, 5, 7, 5, 0.7),
        food('BILLA skyr yogurt', '150 g', 93, 17, 6, 0, 0.74),
      ],
    },
    {
      title: 'Monster Ultra White',
      source: friendSource,
      notes: 'Snack between breakfast and lunch. The white one.',
      items: [food('Monster Energy Ultra White', '500 ml can', 11, 0, 4, 0, 0.95)],
    },
    {
      title: 'Pepsi Max',
      source: friendSource,
      notes: 'Snack between breakfast and lunch. One and a half liters.',
      items: [food('Pepsi Max', '1.5 L', 15, 0, 0, 0, 0.95)],
    },
    {
      title: 'Lunch',
      source: friendSource,
      notes: 'Gyros Style Bowl from Billa, and a Kinder Bueno.',
      items: [
        food('Simply Good Gyros Style Bowl', '1 bowl', 482, 20, 54, 20, 0.93),
        food('Kinder Bueno', '43 g pack', 244, 4, 21, 16, 0.95),
      ],
    },
    {
      title: 'Vanilla high protein',
      source: friendSource,
      notes: 'Snack between lunch and dinner. Ehrmann high-protein vanilla pudding, from Billa.',
      items: [food('Ehrmann high-protein vanilla pudding', '200 g cup', 152, 20, 11, 3, 0.95)],
    },
    {
      title: 'Salami pizza',
      source: friendSource,
      notes: 'Snack between lunch and dinner. One mini pizza.',
      items: [food('Salami mini pizza', '1 mini pizza, 120 g', 311, 12, 43, 9, 0.93)],
    },
    {
      title: 'Kinder Maxi King',
      source: friendSource,
      notes: 'Snack between lunch and dinner.',
      items: [food('Kinder Maxi King', '35 g', 182, 2, 13, 13, 0.9)],
    },
    {
      title: 'Sausage sandwiches',
      source: friendSource,
      notes: 'Two Billa sausage sandwiches.',
      items: [
        food('BILLA sausage sandwich', '170 g', 379, 13, 44, 16, 0.86, 2),
      ],
    },
  ];
}

/**
 * Today, plus two earlier mock days.
 * Earlier days use usual portions, not a weighed log.
 */
export function createFriendHistory(): FriendDayLog[] {
  return [
    {
      dayOffset: -2,
      meals: [
        {
          title: 'Skyr yogurt',
          source: friendSource,
          notes: 'A bowl of skyr with berries.',
          items: [
            food('BILLA skyr yogurt', '250 g', 155, 28, 10, 0, 0.74),
            food('Berries', '100 g', 45, 1, 9, 0, 0.7),
          ],
        },
        {
          title: 'Apple',
          source: friendSource,
          notes: 'One apple between breakfast and lunch.',
          items: [food('Apple', '1 medium', 85, 0, 20, 0, 0.8)],
        },
        {
          title: 'Tuna salad',
          source: friendSource,
          notes: 'A tuna salad from the Billa counter.',
          items: [food('Tuna salad', '1 box', 330, 28, 8, 18, 0.7)],
        },
        {
          title: 'Milka',
          source: friendSource,
          notes: 'A few squares in the afternoon.',
          items: [food('Milka alpine milk', '40 g', 215, 3, 23, 12, 0.9)],
        },
        {
          title: 'Vegetables with feta',
          source: friendSource,
          notes: 'Grilled vegetables with feta.',
          items: [
            food('Grilled vegetables', '300 g', 120, 4, 16, 4, 0.7),
            food('Feta', '60 g', 160, 9, 1, 13, 0.8),
          ],
        },
      ],
    },
    {
      dayOffset: -1,
      meals: [
        {
          title: 'Bread rolls',
          source: friendSource,
          notes: 'Two rolls with butter and mountain cheese.',
          items: [
            food('Kaiser roll', '1 roll', 170, 6, 33, 1, 0.75, 2),
            food('Butter', '10 g', 74, 0, 0, 8, 0.8),
            food('Mountain cheese', '30 g', 123, 9, 0, 10, 0.75),
          ],
        },
        {
          title: 'Manner wafers',
          source: friendSource,
          notes: 'One pack of Manner wafers.',
          items: [food('Manner wafers', '75 g pack', 370, 5, 48, 18, 0.9)],
        },
        {
          title: 'Herbal soda',
          source: friendSource,
          notes: 'Half a liter with the wafers.',
          items: [food('Almdudler', '500 ml', 180, 0, 45, 0, 0.9)],
        },
        {
          title: 'Meatloaf roll',
          source: friendSource,
          notes: 'The normal lunch. A meatloaf roll.',
          items: [
            food('Kaiser roll', '1 roll', 170, 6, 33, 1, 0.75),
            food('Meatloaf', '100 g', 310, 15, 1, 27, 0.75),
          ],
        },
        {
          title: 'Goulash',
          source: friendSource,
          notes: 'A plate of goulash with one dumpling.',
          items: [
            food('Goulash', '1 plate', 450, 30, 10, 32, 0.7),
            food('Bread dumpling', '1 dumpling', 190, 5, 34, 3, 0.7),
          ],
        },
      ],
    },
    { dayOffset: 0, meals: createFriendDay() },
  ];
}

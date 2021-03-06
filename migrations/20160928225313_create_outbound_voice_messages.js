
exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.createTable('outbound_voice_messages', (table) => {
      table.increments('id').primary();

      table.dateTime('delivery_date');
      table.dateTime('last_delivery_attempt');
      table.text('recording_key');
      table.text('call_sid');
      table.text('RecordingSid');
      table.boolean('delivered').defaultTo(false);

      table.integer('commid')
        .references('commid')
        .inTable('comms');

      table.timestamp('updated');
      table.timestamp('created').defaultTo(knex.fn.now());
    }),
  ]);
};


exports.down = function (knex, Promise) {
  return Promise.all([

    knex.schema.dropTable('outbound_voice_messages'),

  ]);
};

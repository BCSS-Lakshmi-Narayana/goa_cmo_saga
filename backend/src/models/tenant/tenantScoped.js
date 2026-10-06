/**
 * Mongoose plugin for every tenant_* collection.
 *
 * Adds a required, indexed `tenant_id`, and refuses to run any read, update or
 * delete whose filter does not pin a tenant_id — so a forgotten filter fails
 * loudly instead of returning another tenant's rows. Aggregations must start
 * with a $match on tenant_id for the same reason.
 */

const QUERY_OPS = [
    'find', 'findOne', 'countDocuments', 'distinct',
    'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
    'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany',
];

const pinsTenant = (value) =>
    typeof value === 'string' ? value.length > 0 : value != null && typeof value === 'object' && '$eq' in value;

module.exports = function tenantScoped(schema) {
    schema.add({ tenant_id: { type: String, required: true, index: true } });

    schema.pre(QUERY_OPS, function requireTenantFilter() {
        const filter = this.getFilter ? this.getFilter() : this.getQuery();
        if (!filter || !pinsTenant(filter.tenant_id)) {
            throw new Error(`[tenantScoped] ${this.model.modelName}.${this.op} called without a tenant_id filter`);
        }
    });

    schema.pre('aggregate', function requireTenantMatch() {
        const first = this.pipeline()[0];
        if (!first || !first.$match || !pinsTenant(first.$match.tenant_id)) {
            throw new Error('[tenantScoped] aggregate must begin with { $match: { tenant_id } }');
        }
    });
};

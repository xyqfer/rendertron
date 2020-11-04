/*
 * Copyright 2019 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 not
 * use this file except in compliance with the License. You may obtain a copy
 of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 under
 * the License.
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryCache = void 0;
const config_1 = require("./config");
// implements a cache that uses the "least-recently used" strategy to clear unused elements.
class MemoryCache {
    constructor() {
        this.store = new Map();
        this.config = config_1.ConfigManager.config;
    }
    async clearCache() {
        this.store.clear();
    }
    cacheContent(key, headers, payload) {
        // if the cache gets too big, we evict the least recently used entry (i.e. the first value in the map)
        if (this.store.size >= parseInt(this.config.cacheConfig.cacheMaxEntries) && parseInt(this.config.cacheConfig.cacheMaxEntries) !== -1) {
            const keyToDelete = this.store.keys().next().value;
            this.store.delete(keyToDelete);
        }
        //remove refreshCache from URL
        let cacheKey = key
            .replace(/&?refreshCache=(?:true|false)&?/i, '');
        if (cacheKey.charAt(cacheKey.length - 1) === '?') {
            cacheKey = cacheKey.slice(0, -1);
        }
        const now = new Date();
        this.store.set(cacheKey, {
            saved: new Date(),
            expires: new Date(now.getTime() + parseInt(this.config.cacheConfig.cacheDurationMinutes) * 60 * 1000),
            headers: JSON.stringify(headers),
            payload: JSON.stringify(payload)
        });
    }
    getCachedContent(ctx, key) {
        const now = new Date();
        if (ctx.query.refreshCache) {
            return null;
        }
        let entry = this.store.get(key);
        // we need to re-insert this key to mark it as "most recently read", will remove the cache if expired
        if (entry) {
            // if the cache is expired, delete and recreate
            if (entry.expires.getTime() <= now.getTime() && parseInt(this.config.cacheConfig.cacheDurationMinutes) !== -1) {
                this.store.delete(key);
                entry = undefined;
            }
            else {
                this.store.delete(key);
                this.store.set(key, entry);
            }
        }
        return entry;
    }
    removeEntry(key) {
        this.store.delete(key);
    }
    middleware() {
        return this.handleRequest.bind(this);
    }
    invalidateHandler() {
        return this.handleInvalidateRequest.bind(this);
    }
    async handleInvalidateRequest(ctx, url) {
        this.removeEntry(url);
        ctx.status = 200;
    }
    async handleRequest(ctx, next) {
        // Cache based on full URL. This means requests with different params are
        // cached separately.
        const cacheKey = ctx.url;
        const cachedContent = this.getCachedContent(ctx, cacheKey);
        if (cachedContent) {
            const headers = JSON.parse(cachedContent.headers);
            ctx.set(headers);
            ctx.set('x-rendertron-cached', cachedContent.saved.toUTCString());
            try {
                let payload = JSON.parse(cachedContent.payload);
                if (payload && typeof (payload) === 'object' &&
                    payload.type === 'Buffer') {
                    payload = Buffer.from(payload);
                }
                ctx.body = payload;
                return;
            }
            catch (error) {
                console.log('Erroring parsing cache contents, falling back to normal render');
            }
        }
        await next();
        if (ctx.status === 200) {
            this.cacheContent(cacheKey, ctx.response.headers, ctx.body);
        }
    }
    clearAllCacheHandler() {
        return this.handleClearAllCacheRequest.bind(this);
    }
    async handleClearAllCacheRequest(ctx) {
        this.clearCache();
        ctx.status = 200;
    }
}
exports.MemoryCache = MemoryCache;
//# sourceMappingURL=memory-cache.js.map
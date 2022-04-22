/**
 * External dependencies
 */
import createSelector from 'rememo';
import { set, map, find, get, filter, compact } from 'lodash';

/**
 * WordPress dependencies
 */
import { createRegistrySelector } from '@wordpress/data';
import { addQueryArgs } from '@wordpress/url';
import deprecated from '@wordpress/deprecated';

/**
 * Internal dependencies
 */
import { STORE_NAME } from './name';
import { getQueriedItems } from './queried-data';
import { DEFAULT_ENTITY_KEY } from './entities';
import { getNormalizedCommaSeparable, isRawAttribute } from './utils';
import type { Context, User, WpTemplate } from './entity-types';

type State = any;
type RecordKey = number | string;
type EntityRecord = any;

/**
 * HTTP Query parameters sent with the API request to fetch the entity records.
 */
export type EntityQuery<
	C extends Context,
	Fields extends string[] | undefined = undefined
> = Record< string, any > & {
	context?: C;
	/**
	 * The requested fields. If specified, the REST API will remove from the response
	 * any fields not on that list.
	 */
	_fields?: Fields;
};

/**
 * Shared reference to an empty object for cases where it is important to avoid
 * returning a new object reference on every invocation, as in a connected or
 * other pure component which performs `shouldComponentUpdate` check on props.
 * This should be used as a last resort, since the normalized data should be
 * maintained by the reducer result in state.
 */
const EMPTY_OBJECT = {};

/**
 * Returns true if a request is in progress for embed preview data, or false
 * otherwise.
 *
 * @param  state Data state.
 * @param  url   URL the preview would be for.
 *
 * @return Whether a request is in progress for an embed preview.
 */
export const isRequestingEmbedPreview = createRegistrySelector(
	( select ) => ( state: State, url: string ): boolean => {
		return select( STORE_NAME ).isResolving( 'getEmbedPreview', [ url ] );
	}
);

/**
 * Returns all available authors.
 *
 * @deprecated since 11.3. Callers should use `select( 'core' ).getUsers({ who: 'authors' })` instead.
 *
 * @param  state Data state.
 * @param  query Optional object of query parameters to
 *               include with request.
 * @return Authors list.
 */
export function getAuthors(
	state: State,
	query?: EntityQuery< any >
): User< 'edit' >[] {
	deprecated( "select( 'core' ).getAuthors()", {
		since: '5.9',
		alternative: "select( 'core' ).getUsers({ who: 'authors' })",
	} );

	const path = addQueryArgs(
		'/wp/v2/users/?who=authors&per_page=100',
		query
	);
	return getUserQueryResults( state, path );
}

/**
 * Returns the current user.
 *
 * @param  state Data state.
 *
 * @return Current user object.
 */
export function getCurrentUser( state: State ): User< 'edit' > {
	return state.currentUser;
}

/**
 * Returns all the users returned by a query ID.
 *
 * @param  state   Data state.
 * @param  queryID Query ID.
 *
 * @return Users list.
 */
export const getUserQueryResults = createSelector(
	( state: State, queryID: string ): User< 'edit' >[] => {
		const queryResults = state.users.queries[ queryID ];

		return map( queryResults, ( id ) => state.users.byId[ id ] );
	},
	( state: State, queryID: string ) => [
		state.users.queries[ queryID ],
		state.users.byId,
	]
);

/**
 * Returns the loaded entities for the given kind.
 *
 * @deprecated since WordPress 6.0. Use getEntitiesConfig instead
 * @param  state Data state.
 * @param  kind  Entity kind.
 *
 * @return Array of entities with config matching kind.
 */
export function getEntitiesByKind(
	state: State,
	kind: string
): Array< any > {
	deprecated( "wp.data.select( 'core' ).getEntitiesByKind()", {
		since: '6.0',
		alternative: "wp.data.select( 'core' ).getEntitiesConfig()",
	} );
	return getEntitiesConfig( state, kind );
}

/**
 * Returns the loaded entities for the given kind.
 *
 * @param  state Data state.
 * @param  kind  Entity kind.
 *
 * @return Array of entities with config matching kind.
 */
export function getEntitiesConfig(
	state: State,
	kind: string
): Array< any > {
	return filter( state.entities.config, { kind } );
}

/**
 * Returns the entity config given its kind and name.
 *
 * @deprecated since WordPress 6.0. Use getEntityConfig instead
 * @param  state Data state.
 * @param  kind  Entity kind.
 * @param  name  Entity name.
 *
 * @return Entity config
 */
export function getEntity( state: State, kind: string, name: string ): any {
	deprecated( "wp.data.select( 'core' ).getEntity()", {
		since: '6.0',
		alternative: "wp.data.select( 'core' ).getEntityConfig()",
	} );
	return getEntityConfig( state, kind, name );
}

/**
 * Returns the entity config given its kind and name.
 *
 * @param  state Data state.
 * @param  kind  Entity kind.
 * @param  name  Entity name.
 *
 * @return Entity config
 */
export function getEntityConfig(
	state: State,
	kind: string,
	name: string
): any {
	return find( state.entities.config, { kind, name } );
}

/**
 * Returns the Entity's record object by key. Returns `null` if the value is not
 * yet received, undefined if the value entity is known to not exist, or the
 * entity object if it exists and is received.
 *
 * @param  state State tree
 * @param  kind  Entity kind.
 * @param  name  Entity name.
 * @param  key   Record's key
 * @param  query Optional query.
 *
 * @return Record.
 */
export const getEntityRecord = createSelector(
	(
		state: State,
		kind: string,
		name: string,
		key: RecordKey,
		query?: EntityQuery< any >
	): EntityRecord | undefined => {
		const queriedState = get( state.entities.records, [
			kind,
			name,
			'queriedData',
		] );
		if ( ! queriedState ) {
			return undefined;
		}
		const context = query?.context ?? 'default';

		if ( query === undefined ) {
			// If expecting a complete item, validate that completeness.
			if ( ! queriedState.itemIsComplete[ context ]?.[ key ] ) {
				return undefined;
			}

			return queriedState.items[ context ][ key ];
		}

		const item = queriedState.items[ context ]?.[ key ];
		if ( item && query._fields ) {
			const filteredItem = {};
			const fields = getNormalizedCommaSeparable( query._fields ) ?? [];
			for ( let f = 0; f < fields.length; f++ ) {
				const field = fields[ f ].split( '.' );
				const value = get( item, field );
				set( filteredItem, field, value );
			}
			return filteredItem;
		}

		return item;
	},
	(
		state: State,
		kind: string,
		name: string,
		recordId: RecordKey,
		query?: EntityQuery< any >
	) => {
		const context = query?.context ?? 'default';
		return [
			get( state.entities.records, [
				kind,
				name,
				'queriedData',
				'items',
				context,
				recordId,
			] ),
			get( state.entities.records, [
				kind,
				name,
				'queriedData',
				'itemIsComplete',
				context,
				recordId,
			] ),
		];
	}
);

/**
 * Returns the Entity's record object by key. Doesn't trigger a resolver nor requests the entity records from the API if the entity record isn't available in the local state.
 *
 * @param  state State tree
 * @param  kind  Entity kind.
 * @param  name  Entity name.
 * @param  key   Record's key
 *
 * @return Record.
 */
export function __experimentalGetEntityRecordNoResolver(
	state: State,
	kind: string,
	name: string,
	key: string | number
): EntityRecord {
	return getEntityRecord( state, kind, name, key );
}

/**
 * Returns the entity's record object by key,
 * with its attributes mapped to their raw values.
 *
 * @param  state State tree.
 * @param  kind  Entity kind.
 * @param  name  Entity name.
 * @param  key   Record's key.
 *
 * @return Object with the entity's raw attributes.
 */
export const getRawEntityRecord = createSelector(
	(
		state: State,
		kind: string,
		name: string,
		key: string | number
	): EntityRecord | undefined => {
		const record = getEntityRecord( state, kind, name, key );
		return (
			record &&
			Object.keys( record ).reduce( ( accumulator, _key ) => {
				if (
					isRawAttribute( getEntityConfig( state, kind, name ), _key )
				) {
					// Because edits are the "raw" attribute values,
					// we return those from record selectors to make rendering,
					// comparisons, and joins with edits easier.
					accumulator[ _key ] = get(
						record[ _key ],
						'raw',
						record[ _key ]
					);
				} else {
					accumulator[ _key ] = record[ _key ];
				}
				return accumulator;
			}, {} )
		);
	},
	(
		state: State,
		kind: string,
		name: string,
		recordId: RecordKey,
		query?: EntityQuery< any >
	) => {
		const context = query?.context ?? 'default';
		return [
			state.entities.config,
			get( state.entities.records, [
				kind,
				name,
				'queriedData',
				'items',
				context,
				recordId,
			] ),
			get( state.entities.records, [
				kind,
				name,
				'queriedData',
				'itemIsComplete',
				context,
				recordId,
			] ),
		];
	}
);

/**
 * Returns true if records have been received for the given set of parameters,
 * or false otherwise.
 *
 * @param  state State tree
 * @param  kind  Entity kind.
 * @param  name  Entity name.
 * @param  query Optional terms query.
 *
 * @return  Whether entity records have been received.
 */
export function hasEntityRecords(
	state: State,
	kind: string,
	name: string,
	query?: EntityQuery< any >
): boolean {
	return Array.isArray( getEntityRecords( state, kind, name, query ) );
}

/**
 * Returns the Entity's records.
 *
 * @param  state State tree
 * @param  kind  Entity kind.
 * @param  name  Entity name.
 * @param  query Optional terms query.
 *
 * @return Records.
 */
export function getEntityRecords(
	state: State,
	kind: string,
	name: string,
	query?: EntityQuery< any >
): Array< EntityRecord > {
	// Queried data state is prepopulated for all known entities. If this is not
	// assigned for the given parameters, then it is known to not exist.
	const queriedState = get( state.entities.records, [
		kind,
		name,
		'queriedData',
	] );
	if ( ! queriedState ) {
		return null;
	}
	return getQueriedItems( queriedState, query );
}

type DirtyEntityRecord = {
	title: string;
	key: string;
	name: string;
	kind: string;
};
/**
 * Returns the  list of dirty entity records.
 *
 * @param  state State tree.
 *
 * @return The list of updated records
 */
export const __experimentalGetDirtyEntityRecords = createSelector(
	( state: State ): Array< DirtyEntityRecord > => {
		const {
			entities: { records },
		} = state;
		const dirtyRecords = [];
		Object.keys( records ).forEach( ( kind ) => {
			Object.keys( records[ kind ] ).forEach( ( name ) => {
				const primaryKeys = Object.keys(
					records[ kind ][ name ].edits
				).filter(
					( primaryKey: string | number ) =>
						// The entity record must exist (not be deleted),
						// and it must have edits.
						getEntityRecord( state, kind, name, primaryKey ) &&
						hasEditsForEntityRecord( state, kind, name, primaryKey )
				);

				if ( primaryKeys.length ) {
					const entityConfig = getEntityConfig( state, kind, name );
					primaryKeys.forEach( ( primaryKey ) => {
						const entityRecord = getEditedEntityRecord(
							state,
							kind,
							name,
							primaryKey
						);
						dirtyRecords.push( {
							// We avoid using primaryKey because it's transformed into a string
							// when it's used as an object key.
							key:
								entityRecord[
									entityConfig.key || DEFAULT_ENTITY_KEY
								],
							title:
								entityConfig?.getTitle?.( entityRecord ) || '',
							name,
							kind,
						} );
					} );
				}
			} );
		} );

		return dirtyRecords;
	},
	( state ) => [ state.entities.records ]
);

/**
 * Returns the list of entities currently being saved.
 *
 * @param  state State tree.
 *
 * @return The list of records being saved.
 */
export const __experimentalGetEntitiesBeingSaved = createSelector(
	( state: State ): Array< DirtyEntityRecord > => {
		const {
			entities: { records },
		} = state;
		const recordsBeingSaved = [];
		Object.keys( records ).forEach( ( kind ) => {
			Object.keys( records[ kind ] ).forEach( ( name ) => {
				const primaryKeys = Object.keys(
					records[ kind ][ name ].saving
				).filter( ( primaryKey ) =>
					isSavingEntityRecord( state, kind, name, primaryKey )
				);

				if ( primaryKeys.length ) {
					const entityConfig = getEntityConfig( state, kind, name );
					primaryKeys.forEach( ( primaryKey ) => {
						const entityRecord = getEditedEntityRecord(
							state,
							kind,
							name,
							primaryKey
						);
						recordsBeingSaved.push( {
							// We avoid using primaryKey because it's transformed into a string
							// when it's used as an object key.
							key:
								entityRecord[
									entityConfig.key || DEFAULT_ENTITY_KEY
								],
							title:
								entityConfig?.getTitle?.( entityRecord ) || '',
							name,
							kind,
						} );
					} );
				}
			} );
		} );
		return recordsBeingSaved;
	},
	( state ) => [ state.entities.records ]
);

/**
 * Returns the specified entity record's edits.
 *
 * @param  state    State tree.
 * @param  kind     Entity kind.
 * @param  name     Entity name.
 * @param  recordId Record ID.
 *
 * @return The entity record's edits.
 */
export function getEntityRecordEdits(
	state: State,
	kind: string,
	name: string,
	recordId: RecordKey
): any {
	return get( state.entities.records, [ kind, name, 'edits', recordId ] );
}

/**
 * Returns the specified entity record's non transient edits.
 *
 * Transient edits don't create an undo level, and
 * are not considered for change detection.
 * They are defined in the entity's config.
 *
 * @param  state    State tree.
 * @param  kind     Entity kind.
 * @param  name     Entity name.
 * @param  recordId Record ID.
 *
 * @return The entity record's non transient edits.
 */
export const getEntityRecordNonTransientEdits = createSelector(
	( state: State, kind: string, name: string, recordId: RecordKey ): any => {
		const { transientEdits } = getEntityConfig( state, kind, name ) || {};
		const edits = getEntityRecordEdits( state, kind, name, recordId ) || {};
		if ( ! transientEdits ) {
			return edits;
		}
		return Object.keys( edits ).reduce( ( acc, key ) => {
			if ( ! transientEdits[ key ] ) {
				acc[ key ] = edits[ key ];
			}
			return acc;
		}, {} );
	},
	( state: State, kind: string, name: string, recordId: RecordKey ) => [
		state.entities.config,
		get( state.entities.records, [ kind, name, 'edits', recordId ] ),
	]
);

/**
 * Returns true if the specified entity record has edits,
 * and false otherwise.
 *
 * @param  state    State tree.
 * @param  kind     Entity kind.
 * @param  name     Entity name.
 * @param  recordId Record ID.
 *
 * @return Whether the entity record has edits or not.
 */
export function hasEditsForEntityRecord(
	state: State,
	kind: string,
	name: string,
	recordId: RecordKey
): boolean {
	return (
		isSavingEntityRecord( state, kind, name, recordId ) ||
		Object.keys(
			getEntityRecordNonTransientEdits( state, kind, name, recordId )
		).length > 0
	);
}

/**
 * Returns the specified entity record, merged with its edits.
 *
 * @param  state    State tree.
 * @param  kind     Entity kind.
 * @param  name     Entity name.
 * @param  recordId Record ID.
 *
 * @return The entity record, merged with its edits.
 */
export const getEditedEntityRecord = createSelector(
	(
		state: State,
		kind: string,
		name: string,
		recordId: RecordKey
	): EntityRecord => ( {
		...getRawEntityRecord( state, kind, name, recordId ),
		...getEntityRecordEdits( state, kind, name, recordId ),
	} ),
	(
		state: State,
		kind: string,
		name: string,
		recordId: RecordKey,
		query?: EntityQuery< any >
	) => {
		const context = query?.context ?? 'default';
		return [
			state.entities.config,
			get( state.entities.records, [
				kind,
				name,
				'queriedData',
				'items',
				context,
				recordId,
			] ),
			get( state.entities.records, [
				kind,
				name,
				'queriedData',
				'itemIsComplete',
				context,
				recordId,
			] ),
			get( state.entities.records, [ kind, name, 'edits', recordId ] ),
		];
	}
);

/**
 * Returns true if the specified entity record is autosaving, and false otherwise.
 *
 * @param  state    State tree.
 * @param  kind     Entity kind.
 * @param  name     Entity name.
 * @param  recordId Record ID.
 *
 * @return Whether the entity record is autosaving or not.
 */
export function isAutosavingEntityRecord(
	state: State,
	kind: string,
	name: string,
	recordId: RecordKey
): boolean {
	const { pending, isAutosave } = get(
		state.entities.records,
		[ kind, name, 'saving', recordId ],
		{}
	);
	return Boolean( pending && isAutosave );
}

/**
 * Returns true if the specified entity record is saving, and false otherwise.
 *
 * @param  state    State tree.
 * @param  kind     Entity kind.
 * @param  name     Entity name.
 * @param  recordId Record ID.
 *
 * @return Whether the entity record is saving or not.
 */
export function isSavingEntityRecord(
	state: State,
	kind: string,
	name: string,
	recordId: RecordKey
): boolean {
	return get(
		state.entities.records,
		[ kind, name, 'saving', recordId, 'pending' ],
		false
	);
}

/**
 * Returns true if the specified entity record is deleting, and false otherwise.
 *
 * @param  state    State tree.
 * @param  kind     Entity kind.
 * @param  name     Entity name.
 * @param  recordId Record ID.
 *
 * @return Whether the entity record is deleting or not.
 */
export function isDeletingEntityRecord(
	state: State,
	kind: string,
	name: string,
	recordId: RecordKey
): boolean {
	return get(
		state.entities.records,
		[ kind, name, 'deleting', recordId, 'pending' ],
		false
	);
}

/**
 * Returns the specified entity record's last save error.
 *
 * @param  state    State tree.
 * @param  kind     Entity kind.
 * @param  name     Entity name.
 * @param  recordId Record ID.
 *
 * @return The entity record's save error.
 */
export function getLastEntitySaveError(
	state: State,
	kind: string,
	name: string,
	recordId: RecordKey
): any {
	return get( state.entities.records, [
		kind,
		name,
		'saving',
		recordId,
		'error',
	] );
}

/**
 * Returns the specified entity record's last delete error.
 *
 * @param  state    State tree.
 * @param  kind     Entity kind.
 * @param  name     Entity name.
 * @param  recordId Record ID.
 *
 * @return The entity record's save error.
 */
export function getLastEntityDeleteError(
	state: State,
	kind: string,
	name: string,
	recordId: RecordKey
): any {
	return get( state.entities.records, [
		kind,
		name,
		'deleting',
		recordId,
		'error',
	] );
}

/**
 * Returns the current undo offset for the
 * entity records edits history. The offset
 * represents how many items from the end
 * of the history stack we are at. 0 is the
 * last edit, -1 is the second last, and so on.
 *
 * @param  state State tree.
 *
 * @return The current undo offset.
 */
function getCurrentUndoOffset( state: State ): number {
	return state.undo.offset;
}

/**
 * Returns the previous edit from the current undo offset
 * for the entity records edits history, if any.
 *
 * @param  state State tree.
 *
 * @return The edit.
 */
export function getUndoEdit( state: State ): Object | undefined {
	return state.undo[ state.undo.length - 2 + getCurrentUndoOffset( state ) ];
}

/**
 * Returns the next edit from the current undo offset
 * for the entity records edits history, if any.
 *
 * @param  state State tree.
 *
 * @return The edit.
 */
export function getRedoEdit( state: State ): Object {
	return state.undo[ state.undo.length + getCurrentUndoOffset( state ) ];
}

/**
 * Returns true if there is a previous edit from the current undo offset
 * for the entity records edits history, and false otherwise.
 *
 * @param  state State tree.
 *
 * @return Whether there is a previous edit or not.
 */
export function hasUndo( state: State ): boolean {
	return Boolean( getUndoEdit( state ) );
}

/**
 * Returns true if there is a next edit from the current undo offset
 * for the entity records edits history, and false otherwise.
 *
 * @param  state State tree.
 *
 * @return Whether there is a next edit or not.
 */
export function hasRedo( state: State ): boolean {
	return Boolean( getRedoEdit( state ) );
}

/**
 * Return the current theme.
 *
 * @param  state Data state.
 *
 * @return The current theme.
 */
export function getCurrentTheme( state: State ): any {
	return getEntityRecord( state, 'root', 'theme', state.currentTheme );
}

/**
 * Return the ID of the current global styles object.
 *
 * @param  state Data state.
 *
 * @return The current global styles ID.
 */
export function __experimentalGetCurrentGlobalStylesId( state: State ): string {
	return state.currentGlobalStylesId;
}

/**
 * Return theme supports data in the index.
 *
 * @param  state Data state.
 *
 * @return Index data.
 */
export function getThemeSupports( state: State ): Object {
	return getCurrentTheme( state )?.theme_supports ?? EMPTY_OBJECT;
}

/**
 * Returns the embed preview for the given URL.
 *
 * @param  state Data state.
 * @param  url   Embedded URL.
 *
 * @return Undefined if the preview has not been fetched, otherwise, the preview fetched from the embed preview API.
 */
export function getEmbedPreview( state: State, url: string ): Object {
	return state.embedPreviews[ url ];
}

/**
 * Determines if the returned preview is an oEmbed link fallback.
 *
 * WordPress can be configured to return a simple link to a URL if it is not embeddable.
 * We need to be able to determine if a URL is embeddable or not, based on what we
 * get back from the oEmbed preview API.
 *
 * @param  state Data state.
 * @param  url   Embedded URL.
 *
 * @return Is the preview for the URL an oEmbed link fallback.
 */
export function isPreviewEmbedFallback( state: State, url: string ): boolean {
	const preview = state.embedPreviews[ url ];
	const oEmbedLinkCheck = '<a href="' + url + '">' + url + '</a>';
	if ( ! preview ) {
		return false;
	}
	return preview.html === oEmbedLinkCheck;
}

/**
 * Returns whether the current user can perform the given action on the given
 * REST resource.
 *
 * Calling this may trigger an OPTIONS request to the REST API via the
 * `canUser()` resolver.
 *
 * https://developer.wordpress.org/rest-api/reference/
 *
 * @param  state    Data state.
 * @param  action   Action to check. One of: 'create', 'read', 'update', 'delete'.
 * @param  resource REST resource to check, e.g. 'media' or 'posts'.
 * @param  id       Optional ID of the rest resource to check.
 *
 * @return Whether or not the user can perform the action,
 *                             or `undefined` if the OPTIONS request is still being made.
 */
export function canUser(
	state: State,
	action: string,
	resource: string,
	id?: number | string
): boolean | undefined {
	const key = compact( [ action, resource, id ] ).join( '/' );
	return get( state, [ 'userPermissions', key ] );
}

/**
 * Returns whether the current user can edit the given entity.
 *
 * Calling this may trigger an OPTIONS request to the REST API via the
 * `canUser()` resolver.
 *
 * https://developer.wordpress.org/rest-api/reference/
 *
 * @param  state    Data state.
 * @param  kind     Entity kind.
 * @param  name     Entity name.
 * @param  recordId Record's id.
 * @return Whether or not the user can edit,
 * or `undefined` if the OPTIONS request is still being made.
 */
export function canUserEditEntityRecord(
	state: State,
	kind: string,
	name: string,
	recordId: RecordKey
): boolean | undefined {
	const entityConfig = getEntityConfig( state, kind, name );
	if ( ! entityConfig ) {
		return false;
	}
	const resource = entityConfig.__unstable_rest_base;

	return canUser( state, 'update', resource, recordId );
}

/**
 * Returns the latest autosaves for the post.
 *
 * May return multiple autosaves since the backend stores one autosave per
 * author for each post.
 *
 * @param  state    State tree.
 * @param  postType The type of the parent post.
 * @param  postId   The id of the parent post.
 *
 * @return An array of autosaves for the post, or undefined if there is none.
 */
export function getAutosaves(
	state: State,
	postType: string,
	postId: number
): Array< any > | undefined {
	return state.autosaves[ postId ];
}

/**
 * Returns the autosave for the post and author.
 *
 * @param  state    State tree.
 * @param  postType The type of the parent post.
 * @param  postId   The id of the parent post.
 * @param  authorId The id of the author.
 *
 * @return The autosave for the post and author.
 */
export function getAutosave(
	state: State,
	postType: string,
	postId: number,
	authorId: number
): EntityRecord {
	if ( authorId === undefined ) {
		return;
	}

	const autosaves = state.autosaves[ postId ];
	return find( autosaves, { author: authorId } );
}

/**
 * Returns true if the REST request for autosaves has completed.
 *
 * @param  state    State tree.
 * @param  postType The type of the parent post.
 * @param  postId   The id of the parent post.
 *
 * @return True if the REST request was completed. False otherwise.
 */
export const hasFetchedAutosaves = createRegistrySelector(
	( select ) => (
		state: State,
		postType: string,
		postId: number
	): boolean => {
		return select( STORE_NAME ).hasFinishedResolution( 'getAutosaves', [
			postType,
			postId,
		] );
	}
);

/**
 * Returns a new reference when edited values have changed. This is useful in
 * inferring where an edit has been made between states by comparison of the
 * return values using strict equality.
 *
 * @example
 *
 * ```
 * const hasEditOccurred = (
 *    getReferenceByDistinctEdits( beforeState ) !==
 *    getReferenceByDistinctEdits( afterState )
 * );
 * ```
 *
 * @param  state Editor state.
 *
 * @return A value whose reference will change only when an edit occurs.
 */
export const getReferenceByDistinctEdits = createSelector(
	() => [],
	( state: State ) => [
		state.undo.length,
		state.undo.offset,
		state.undo.flattenedUndo,
	]
);

/**
 * Retrieve the frontend template used for a given link.
 *
 * @param  state Editor state.
 * @param  link  Link.
 *
 * @return The template record.
 */
export function __experimentalGetTemplateForLink(
	state: State,
	link: string
): WpTemplate< 'edit' > | null {
	const records = getEntityRecords( state, 'postType', 'wp_template', {
		'find-template': link,
	} );

	const template = records?.length ? records[ 0 ] : null;
	if ( template ) {
		return getEditedEntityRecord(
			state,
			'postType',
			'wp_template',
			template.id
		);
	}
	return template;
}

/**
 * Retrieve the current theme's base global styles
 *
 * @param  state Editor state.
 *
 * @return The Global Styles object.
 */
export function __experimentalGetCurrentThemeBaseGlobalStyles(
	state: State
): any | null {
	const currentTheme = getCurrentTheme( state );
	if ( ! currentTheme ) {
		return null;
	}
	return state.themeBaseGlobalStyles[ currentTheme.stylesheet ];
}

/**
 * Return the ID of the current global styles object.
 *
 * @param  state Data state.
 *
 * @return The current global styles ID.
 */
export function __experimentalGetCurrentThemeGlobalStylesVariations(
	state: State
): string | null {
	const currentTheme = getCurrentTheme( state );
	if ( ! currentTheme ) {
		return null;
	}
	return state.themeGlobalStyleVariations[ currentTheme.stylesheet ];
}

/**
 * Retrieve the list of registered block patterns.
 *
 * @param  state Data state.
 *
 * @return Block pattern list.
 */
export function getBlockPatterns( state: State ): Array< any > {
	return state.blockPatterns;
}

/**
 * Retrieve the list of registered block pattern categories.
 *
 * @param  state Data state.
 *
 * @return Block pattern category list.
 */
export function getBlockPatternCategories( state: State ): Array< any > {
	return state.blockPatternCategories;
}
